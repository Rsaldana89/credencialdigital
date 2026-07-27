const fs = require('fs/promises');
const path = require('path');
const employeeService = require('../services/employeeService');
const qrService = require('../services/qrService');
const credentialImageService = require('../services/credentialImageService');

function formatDate(value) {
  if (!value) return 'No disponible';
  const text = String(value).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}

function formatDateTime(value = new Date()) {
  const parts = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(value);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.day}/${values.month}/${values.year} ${values.hour}:${values.minute}`;
}

function getClientIp(req) {
  const forwarded = req.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || '';
}

async function logResolution(req, resolution) {
  await employeeService.logQrAccess({
    token: resolution.token,
    employeeNumber: resolution.employee?.employee_number || resolution.employee?.token_employee_number || null,
    result: resolution.status,
    ipAddress: getClientIp(req),
    userAgent: req.get('user-agent')
  });
}

function renderInvalidCredential(res) {
  return res.status(404).render('invalid', {
    title: 'Identificación no vigente',
    heading: 'Identificación no vigente',
    message: 'Empleado no encontrado o dado de baja.'
  });
}

function home(req, res) {
  res.render('index', {
    title: 'Credenciales Digitales QR CHC'
  });
}

async function credential(req, res, next) {
  try {
    const resolution = await employeeService.resolvePublicToken(req.params.token);
    await logResolution(req, resolution);

    if (resolution.status !== 'VALID') {
      return renderInvalidCredential(res);
    }

    const generatedAt = formatDateTime();
    const qrDataUrl = await qrService.generateDataUrl(resolution.token);

    return res.render('credential', {
      title: `Credencial de ${resolution.employee.full_name || 'empleado'}`,
      employee: resolution.employee,
      token: resolution.token,
      qrDataUrl,
      generatedAt,
      formattedStartDate: formatDate(resolution.employee.start_date),
      displayEmployeeNumber: employeeService.formatEmployeeNumber(resolution.employee.employee_number),
      pageStyles: '/css/credential-v30.css',
      hideSiteChrome: true
    });
  } catch (error) {
    return next(error);
  }
}

async function employeePhoto(req, res, next) {
  try {
    const resolution = await employeeService.resolvePublicToken(req.params.token);
    if (resolution.status !== 'VALID') {
      return res.sendFile(path.join(__dirname, '..', 'public', 'img', 'photo-placeholder.png'));
    }

    const photo = await employeeService.getPhotoByEmployeeNumber(resolution.employee.employee_number);
    if (!photo) {
      return res.sendFile(path.join(__dirname, '..', 'public', 'img', 'photo-placeholder.png'));
    }

    res.set({
      'Content-Type': photo.mime_type || 'image/jpeg',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.send(photo.photo_blob);
  } catch (error) {
    return next(error);
  }
}

async function downloadCredentialPng(req, res, next) {
  try {
    const resolution = await employeeService.resolvePublicToken(req.params.token);
    await logResolution(req, resolution);

    if (resolution.status !== 'VALID') {
      return renderInvalidCredential(res);
    }

    const employee = resolution.employee;
    const storedPhoto = await employeeService.getPhotoByEmployeeNumber(employee.employee_number);
    const [logoBuffer, sloganBuffer, placeholderBuffer, qrBuffer] = await Promise.all([
      fs.readFile(path.join(__dirname, '..', 'public', 'img', 'logo-corporativo-v30.png')),
      fs.readFile(path.join(__dirname, '..', 'public', 'img', 'frase-corporativa-v30.png')),
      storedPhoto
        ? Promise.resolve(null)
        : fs.readFile(path.join(__dirname, '..', 'public', 'img', 'photo-placeholder.png')),
      qrService.generatePngBuffer(resolution.token)
    ]);

    const generatedAt = formatDateTime();
    const displayEmployeeNumber = employeeService.formatEmployeeNumber(employee.employee_number);
    const imageBuffer = await credentialImageService.generateCredentialPng({
      employee,
      photoBuffer: storedPhoto?.photo_blob || placeholderBuffer,
      logoBuffer,
      sloganBuffer,
      qrBuffer,
      formattedStartDate: formatDate(employee.start_date),
      displayEmployeeNumber,
      generatedAt
    });

    const employeeNumber = employeeService.normalizeEmployeeNumber(employee.employee_number)
      ? displayEmployeeNumber
      : 'EMPLEADO';
    const filename = `${employeeNumber}_CREDENCIAL_QR.png`;

    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.send(imageBuffer);
  } catch (error) {
    return next(error);
  }
}

module.exports = { home, credential, employeePhoto, downloadCredentialPng };
