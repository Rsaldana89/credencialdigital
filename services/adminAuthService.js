const crypto = require('crypto');

function safeEqual(left, right) {
  const leftDigest = crypto.createHash('sha256').update(String(left || '')).digest();
  const rightDigest = crypto.createHash('sha256').update(String(right || '')).digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

function getConfiguredUsers(env = process.env) {
  const configuredUsers = [
    {
      username: env.ADMIN_USER || 'admin',
      password: env.ADMIN_PASSWORD || 'admin123',
      role: 'admin'
    },
    {
      username: env.CAPITAL_HUMANO_1_USER,
      password: env.CAPITAL_HUMANO_1_PASSWORD,
      role: 'capital_humano'
    },
    {
      username: env.CAPITAL_HUMANO_2_USER,
      password: env.CAPITAL_HUMANO_2_PASSWORD,
      role: 'capital_humano'
    }
  ].filter((user) => user.username && user.password);

  // Evita configuraciones duplicadas: se conserva la primera coincidencia.
  return configuredUsers.filter((user, index, users) => {
    return users.findIndex((candidate) => candidate.username === user.username) === index;
  });
}

function authenticate(username, password, env = process.env) {
  const submittedUsername = String(username || '').trim();
  const submittedPassword = String(password || '');

  return getConfiguredUsers(env).find((user) => {
    return safeEqual(submittedUsername, user.username)
      && safeEqual(submittedPassword, user.password);
  }) || null;
}

module.exports = {
  authenticate,
  getConfiguredUsers
};
