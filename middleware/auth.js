function requireAdmin(req, res, next) {
  if (req.session && req.session.adminAuthenticated) {
    return next();
  }

  req.session.returnTo = req.originalUrl;
  return res.redirect('/admin/login');
}

function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.adminAuthenticated) {
    return res.redirect('/admin');
  }
  return next();
}

module.exports = { requireAdmin, redirectIfAuthenticated };
