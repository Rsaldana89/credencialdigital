'use strict';

const printButton = document.querySelector('[data-print-credential]');
if (printButton) {
  printButton.addEventListener('click', () => {
    window.print();
  });
}

const downloadButton = document.querySelector('[data-download-credential]');

function loadBlobImage(blob) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No fue posible preparar la imagen de la credencial.'));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('No fue posible generar el archivo PNG.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename || 'CREDENCIAL_QR.png';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

function normalizeText(value, fallback = 'No disponible') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function wrapCanvasText(ctx, value, maxWidth, maxLines = 2) {
  const words = normalizeText(value).split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = word;
    if (lines.length >= maxLines - 1) break;
  }

  if (lines.length < maxLines && current) {
    let finalLine = current;
    const usedWords = lines.join(' ').split(/\s+/).filter(Boolean).length;
    const remainingWords = words.slice(usedWords);
    if (remainingWords.length) finalLine = remainingWords.join(' ');

    while (finalLine.length > 1 && ctx.measureText(finalLine).width > maxWidth) {
      finalLine = `${finalLine.slice(0, -2).trim()}…`;
    }
    lines.push(finalLine);
  }

  return lines.slice(0, maxLines);
}

function getCredentialRows() {
  return Array.from(document.querySelectorAll('#digitalCredential .chc30-field-row')).map((row) => ({
    label: normalizeText(row.querySelector('.chc30-label')?.textContent, ''),
    value: normalizeText(row.querySelector('.chc30-value')?.textContent),
    tenure: normalizeText(row.querySelector('.chc30-tenure')?.textContent, '')
  }));
}

function repaintCredentialText(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no permite preparar la credencial para descarga.');

  const rows = getCredentialRows();
  const rowY = [754, 870, 986, 1102, 1218];
  const copyX = 188;
  const copyWidth = 388;
  const textBackground = '#fbfaf8';
  const labelColor = '#16171a';
  const valueColor = '#781321';

  ctx.textBaseline = 'alphabetic';

  rows.forEach((row, index) => {
    const y = rowY[index];
    if (!Number.isFinite(y)) return;

    // El PNG base se genera en el servidor. En algunos contenedores Linux no
    // existen las mismas fuentes que en Chrome y el texto puede convertirse
    // en cuadros. Se limpia solamente la zona de texto y se repinta en el
    // navegador, que sí dispone de una fuente de sistema legible.
    ctx.fillStyle = textBackground;
    ctx.fillRect(177, y + 1, copyWidth + 8, 94);

    ctx.fillStyle = labelColor;
    ctx.font = '700 25px Arial, Helvetica, sans-serif';
    ctx.fillText(row.label, copyX, y + 27, copyWidth);

    if (index === 3 && row.tenure) {
      ctx.fillStyle = valueColor;
      ctx.font = '800 29px Arial, Helvetica, sans-serif';
      ctx.fillText(row.value, copyX, y + 60, copyWidth);
      ctx.font = '700 22px Arial, Helvetica, sans-serif';
      ctx.fillText(row.tenure, copyX, y + 86, copyWidth);
    } else {
      const valueFontSize = index === 0 ? 30 : index === 2 ? 28 : 31;
      ctx.fillStyle = valueColor;
      ctx.font = `800 ${valueFontSize}px Arial, Helvetica, sans-serif`;
      const lines = wrapCanvasText(ctx, row.value, copyWidth, index === 0 || index === 2 ? 2 : 1);
      lines.forEach((line, lineIndex) => {
        ctx.fillText(line, copyX, y + 61 + (lineIndex * 29), copyWidth);
      });
    }

    ctx.strokeStyle = '#c6c5c2';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(48, y + 100);
    ctx.lineTo(576, y + 100);
    ctx.stroke();
  });

  // El texto de la banda del QR también dependía de las fuentes del servidor.
  ctx.fillStyle = '#68141e';
  ctx.fillRect(629, 1220, 309, 86);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 27px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('QR ASOCIADO', 783.5, 1271);
  ctx.textAlign = 'start';
}

async function buildBrowserCredentialPng(downloadUrl) {
  const response = await fetch(downloadUrl, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'image/png' }
  });

  if (!response.ok) {
    throw new Error(`No fue posible descargar la credencial (${response.status}).`);
  }

  const sourceBlob = await response.blob();
  const image = await loadBlobImage(sourceBlob);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || 1001;
  canvas.height = image.naturalHeight || 1570;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no permite preparar la credencial para descarga.');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  repaintCredentialText(canvas);
  return canvasToBlob(canvas);
}

if (downloadButton) {
  downloadButton.addEventListener('click', async () => {
    const downloadUrl = String(downloadButton.dataset.downloadUrl || '').trim();
    const filename = String(downloadButton.dataset.downloadName || 'CREDENCIAL_QR.png').trim();
    if (!downloadUrl) return;

    const originalText = downloadButton.textContent;
    downloadButton.disabled = true;
    downloadButton.textContent = 'Generando credencial…';

    try {
      const finalBlob = await buildBrowserCredentialPng(downloadUrl);
      downloadBlob(finalBlob, filename);
    } catch (error) {
      console.error('No fue posible reconstruir el PNG en el navegador:', error);
      // Fallback: conserva el método de descarga del servidor para no dejar al
      // usuario sin archivo si el navegador bloquea Canvas o Blob.
      const fallback = document.createElement('a');
      fallback.href = downloadUrl;
      fallback.download = filename;
      document.body.appendChild(fallback);
      fallback.click();
      fallback.remove();
    } finally {
      downloadButton.disabled = false;
      downloadButton.textContent = originalText;
    }
  });
}
