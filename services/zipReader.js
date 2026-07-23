const fs = require('fs/promises');
const zlib = require('zlib');
const { promisify } = require('util');

const inflateRaw = promisify(zlib.inflateRaw);

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_EOCD_SEARCH = 65_557;

function zipError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

class SafeZipReader {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.maxEntries = Number(options.maxEntries || 1000);
    this.maxEntryBytes = Number(options.maxEntryBytes || 10 * 1024 * 1024);
    this.maxTotalBytes = Number(options.maxTotalBytes || 500 * 1024 * 1024);
    this.maxCentralDirectoryBytes = Number(options.maxCentralDirectoryBytes || 20 * 1024 * 1024);
    this.handle = null;
    this.fileSize = 0;
    this.entries = [];
  }

  static async open(filePath, options) {
    const reader = new SafeZipReader(filePath, options);
    await reader.initialize();
    return reader;
  }

  async readAt(position, length) {
    if (!Number.isSafeInteger(position) || !Number.isSafeInteger(length) || position < 0 || length < 0) {
      throw zipError('ZIP_INVALID', 'El archivo ZIP contiene posiciones no válidas.');
    }
    if (position + length > this.fileSize) {
      throw zipError('ZIP_TRUNCATED', 'El archivo ZIP está incompleto o dañado.');
    }

    const buffer = Buffer.alloc(length);
    let totalRead = 0;
    while (totalRead < length) {
      const { bytesRead } = await this.handle.read(
        buffer,
        totalRead,
        length - totalRead,
        position + totalRead
      );
      if (!bytesRead) {
        throw zipError('ZIP_TRUNCATED', 'El archivo ZIP está incompleto o dañado.');
      }
      totalRead += bytesRead;
    }
    return buffer;
  }

  async initialize() {
    this.handle = await fs.open(this.filePath, 'r');
    const stats = await this.handle.stat();
    this.fileSize = Number(stats.size || 0);

    if (this.fileSize < 22) {
      throw zipError('ZIP_INVALID', 'El archivo seleccionado no es un ZIP válido.');
    }

    const searchLength = Math.min(this.fileSize, MAX_EOCD_SEARCH + 22);
    const searchStart = this.fileSize - searchLength;
    const tail = await this.readAt(searchStart, searchLength);

    let eocdIndex = -1;
    for (let index = tail.length - 22; index >= 0; index -= 1) {
      if (tail.readUInt32LE(index) === EOCD_SIGNATURE) {
        eocdIndex = index;
        break;
      }
    }

    if (eocdIndex < 0) {
      throw zipError('ZIP_INVALID', 'No se encontró la estructura final del archivo ZIP.');
    }

    const diskNumber = tail.readUInt16LE(eocdIndex + 4);
    const centralDisk = tail.readUInt16LE(eocdIndex + 6);
    const entriesOnDisk = tail.readUInt16LE(eocdIndex + 8);
    const totalEntries = tail.readUInt16LE(eocdIndex + 10);
    const centralSize = tail.readUInt32LE(eocdIndex + 12);
    const centralOffset = tail.readUInt32LE(eocdIndex + 16);

    if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) {
      throw zipError('ZIP_MULTIDISK_UNSUPPORTED', 'No se admiten archivos ZIP divididos en varias partes.');
    }

    if (
      totalEntries === 0xffff ||
      centralSize === 0xffffffff ||
      centralOffset === 0xffffffff
    ) {
      throw zipError('ZIP64_UNSUPPORTED', 'Este ZIP usa el formato ZIP64. Divide las fotografías en lotes más pequeños.');
    }

    if (totalEntries > this.maxEntries) {
      throw zipError(
        'ZIP_TOO_MANY_ENTRIES',
        `El ZIP contiene ${totalEntries} elementos y el máximo permitido es ${this.maxEntries}.`
      );
    }

    if (centralSize > this.maxCentralDirectoryBytes) {
      throw zipError('ZIP_INVALID', 'El directorio interno del ZIP es demasiado grande.');
    }

    if (centralOffset + centralSize > this.fileSize) {
      throw zipError('ZIP_TRUNCATED', 'El directorio interno del ZIP está incompleto.');
    }

    const central = await this.readAt(centralOffset, centralSize);
    let offset = 0;
    let totalUncompressed = 0;
    const entries = [];

    for (let index = 0; index < totalEntries; index += 1) {
      if (offset + 46 > central.length || central.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
        throw zipError('ZIP_INVALID', 'El directorio interno del ZIP está dañado.');
      }

      const flags = central.readUInt16LE(offset + 8);
      const compressionMethod = central.readUInt16LE(offset + 10);
      const crc32 = central.readUInt32LE(offset + 16);
      const compressedSize = central.readUInt32LE(offset + 20);
      const uncompressedSize = central.readUInt32LE(offset + 24);
      const filenameLength = central.readUInt16LE(offset + 28);
      const extraLength = central.readUInt16LE(offset + 30);
      const commentLength = central.readUInt16LE(offset + 32);
      const diskStart = central.readUInt16LE(offset + 34);
      const externalAttributes = central.readUInt32LE(offset + 38);
      const localHeaderOffset = central.readUInt32LE(offset + 42);
      const recordLength = 46 + filenameLength + extraLength + commentLength;

      if (offset + recordLength > central.length) {
        throw zipError('ZIP_TRUNCATED', 'Una entrada del ZIP está incompleta.');
      }
      if (diskStart !== 0) {
        throw zipError('ZIP_MULTIDISK_UNSUPPORTED', 'No se admiten archivos ZIP divididos.');
      }
      if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
        throw zipError('ZIP64_UNSUPPORTED', 'Este ZIP contiene entradas ZIP64. Divide el lote.');
      }

      const filenameBuffer = central.subarray(offset + 46, offset + 46 + filenameLength);
      const filename = filenameBuffer.toString('utf8').replace(/\0/g, '');
      const isDirectory = filename.endsWith('/') || filename.endsWith('\\') || ((externalAttributes >>> 16) & 0o170000) === 0o040000;

      totalUncompressed += uncompressedSize;
      if (totalUncompressed > this.maxTotalBytes) {
        throw zipError(
          'ZIP_UNCOMPRESSED_TOO_LARGE',
          'El contenido descomprimido del ZIP supera el límite permitido. Divide el lote.'
        );
      }

      entries.push({
        index,
        filename,
        flags,
        compressionMethod,
        crc32,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
        isDirectory
      });

      offset += recordLength;
    }

    this.entries = entries;
  }

  listEntries() {
    return [...this.entries];
  }

  async readEntry(entry) {
    if (!entry || !Number.isSafeInteger(entry.localHeaderOffset)) {
      throw zipError('ZIP_INVALID_ENTRY', 'La entrada solicitada no es válida.');
    }
    if (entry.isDirectory) return Buffer.alloc(0);
    if (entry.flags & 0x0001) {
      throw zipError('ZIP_ENCRYPTED', 'No se admiten archivos ZIP protegidos con contraseña.');
    }
    if (entry.uncompressedSize > this.maxEntryBytes) {
      throw zipError(
        'ZIP_ENTRY_TOO_LARGE',
        `El archivo ${entry.filename} supera el límite individual permitido.`
      );
    }
    if (![0, 8].includes(entry.compressionMethod)) {
      throw zipError(
        'ZIP_COMPRESSION_UNSUPPORTED',
        `El archivo ${entry.filename} usa un método de compresión no compatible.`
      );
    }

    const localHeader = await this.readAt(entry.localHeaderOffset, 30);
    if (localHeader.readUInt32LE(0) !== LOCAL_SIGNATURE) {
      throw zipError('ZIP_INVALID', `La cabecera de ${entry.filename} está dañada.`);
    }

    const localFilenameLength = localHeader.readUInt16LE(26);
    const localExtraLength = localHeader.readUInt16LE(28);
    const dataOffset = entry.localHeaderOffset + 30 + localFilenameLength + localExtraLength;
    const compressed = await this.readAt(dataOffset, entry.compressedSize);

    let output;
    if (entry.compressionMethod === 0) {
      output = compressed;
    } else {
      try {
        output = await inflateRaw(compressed, { maxOutputLength: this.maxEntryBytes + 1 });
      } catch (error) {
        const wrapped = zipError('ZIP_DECOMPRESSION_FAILED', `No fue posible descomprimir ${entry.filename}.`);
        wrapped.cause = error;
        throw wrapped;
      }
    }

    if (output.length > this.maxEntryBytes) {
      throw zipError('ZIP_ENTRY_TOO_LARGE', `El archivo ${entry.filename} supera el límite permitido.`);
    }
    if (entry.uncompressedSize !== output.length) {
      throw zipError('ZIP_TRUNCATED', `El archivo ${entry.filename} está incompleto o dañado.`);
    }

    return output;
  }

  async close() {
    if (this.handle) {
      await this.handle.close().catch(() => {});
      this.handle = null;
    }
  }
}

module.exports = { SafeZipReader };
