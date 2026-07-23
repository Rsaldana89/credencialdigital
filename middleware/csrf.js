const crypto = require('crypto');

function attachCsrfToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function verifyCsrfToken(req, res, next) {
  const expected = String(req.session.csrfToken || '');
  const received = String(req.body?._csrf || req.get('x-csrf-token') || '');

  if (!expected || !received || expected.length !== received.length) {
    return res.status(403).render('invalid', {
      title: 'Solicitud no válida',
      heading: 'Solicitud no válida',
      message: 'La sesión del formulario expiró. Actualiza la página e inténtalo nuevamente.'
    });
  }

  const isValid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  if (!isValid) {
    return res.status(403).render('invalid', {
      title: 'Solicitud no válida',
      heading: 'Solicitud no válida',
      message: 'La sesión del formulario expiró. Actualiza la página e inténtalo nuevamente.'
    });
  }

  return next();
}

module.exports = { attachCsrfToken, verifyCsrfToken };
