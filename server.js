require('dotenv').config({ quiet: true });

const path = require('path');
const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const { testConnection, pool } = require('./config/db');
const { attachCsrfToken } = require('./middleware/csrf');
const publicRoutes = require('./routes/publicRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  });
  next();
});

app.use((req, res, next) => {
  if (req.path.startsWith('/admin') || req.path.startsWith('/e/')) {
    res.set('Cache-Control', 'no-store');
  }
  next();
});

app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: isProduction ? '1d' : 0,
  etag: true
}));

app.use(session({
  name: 'chc_credenciales_sid',
  secret: process.env.SESSION_SECRET || 'cambiar_esto_por_una_clave_segura',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.use(attachCsrfToken);
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.isAuthenticated = Boolean(req.session.adminAuthenticated);
  res.locals.adminUser = req.session.adminUser || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

app.use('/', publicRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).render('invalid', {
    title: 'Página no encontrada',
    heading: 'Página no encontrada',
    message: 'La dirección solicitada no existe.'
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);

  const message = isProduction
    ? 'Ocurrió un error al procesar la solicitud.'
    : error.message;

  return res.status(500).render('invalid', {
    title: 'Error del sistema',
    heading: 'Error del sistema',
    message
  });
});

if (require.main === module) {
  app.listen(port, async () => {
    console.log(`Credenciales Digitales QR CHC: http://localhost:${port}`);
    try {
      await testConnection();
      console.log(`Conexión MySQL correcta: ${process.env.DB_NAME || 'sistema_gestion'}`);
    } catch (error) {
      console.error('No fue posible conectar con MySQL:', error.message);
      console.error('Revisa el archivo .env y ejecuta database/schema_local.sql.');
    }

    if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.includes('cambiar_esto'))) {
      console.warn('ADVERTENCIA: configura un SESSION_SECRET seguro antes de publicar.');
    }
  });
}

module.exports = app;
