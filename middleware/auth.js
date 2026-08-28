const adminAuthService = require('../services/adminAuthService');

const SESSION_VALIDATION_MS = 30 * 1000;

async function requireAdmin(req, res, next) {
  if (!(req.session && req.session.adminAuthenticated)) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/admin/login');
  }

  // Valida periodicamente que el usuario siga activo sin consultar MySQL en cada escaneo.
  // Con una ventana de 30 s, desactivar una cuenta desde el panel corta su acceso rápidamente
  // y mantiene ligera la operacion de eventos.
  if (req.session.adminUserId) {
    const now = Date.now();
    const lastValidation = Number(req.session.adminValidatedAt || 0);
    if (!lastValidation || now - lastValidation >= SESSION_VALIDATION_MS) {
      try {
        const user = await adminAuthService.getSessionUser(req.session.adminUserId);
        if (!user) {
          return req.session.destroy(() => {
            res.clearCookie('chc_credenciales_sid');
            return res.redirect('/admin/login');
          });
        }
        req.session.adminUser = user.username;
        req.session.adminDisplayName = user.displayName;
        req.session.adminRole = user.role;
        req.session.adminValidatedAt = now;
        res.locals.adminUser = user.username;
        res.locals.adminDisplayName = user.displayName;
        res.locals.adminRole = user.role;
      } catch (error) {
        return next(error);
      }
    }
  }

  return next();
}

function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.adminAuthenticated) return res.redirect('/admin');
  return next();
}

function requireRole(...allowedRoles) {
  const allowed = new Set(allowedRoles.map((role) => String(role || '').trim().toLowerCase()));
  return (req, res, next) => {
    const role = String(req.session?.adminRole || '').trim().toLowerCase();
    if (req.session?.adminAuthenticated && allowed.has(role)) return next();
    return res.status(403).render('invalid', {
      title: 'Acceso restringido',
      heading: 'Acceso restringido',
      message: 'Tu usuario no tiene permisos para administrar esta sección.'
    });
  };
}

module.exports = { requireAdmin, redirectIfAuthenticated, requireRole };
