const crypto = require('crypto');
const { promisify } = require('util');
const { pool } = require('../config/db');

const scryptAsync = promisify(crypto.scrypt);
const PASSWORD_KEY_LENGTH = 64;
const ALLOWED_ROLES = new Set(['admin', 'capital_humano']);
let initializationPromise = null;

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().slice(0, 80);
}

function normalizeDisplayName(value) {
  return String(value || '').trim().slice(0, 120);
}

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  return ALLOWED_ROLES.has(role) ? role : 'capital_humano';
}

function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
  if (value.length > 200) throw new Error('La contraseña no puede superar 200 caracteres.');
  return value;
}

async function hashPassword(password, { enforcePolicy = true } = {}) {
  const normalized = enforcePolicy ? validatePassword(password) : String(password || '');
  if (!normalized) throw new Error('La contraseña no puede estar vacía.');
  const salt = crypto.randomBytes(16);
  const derivedKey = await scryptAsync(normalized, salt, PASSWORD_KEY_LENGTH);
  return `scrypt$1$${salt.toString('hex')}$${Buffer.from(derivedKey).toString('hex')}`;
}

async function verifyPassword(password, encodedHash) {
  const parts = String(encodedHash || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt' || parts[1] !== '1') return false;
  try {
    const salt = Buffer.from(parts[2], 'hex');
    const expected = Buffer.from(parts[3], 'hex');
    if (salt.length !== 16 || expected.length !== PASSWORD_KEY_LENGTH) return false;
    const actual = Buffer.from(await scryptAsync(String(password || ''), salt, PASSWORD_KEY_LENGTH));
    return crypto.timingSafeEqual(actual, expected);
  } catch (_) {
    return false;
  }
}

function getConfiguredUsers(env = process.env) {
  const configuredUsers = [
    { username: env.ADMIN_USER, password: env.ADMIN_PASSWORD, displayName: 'Administrador', role: 'admin' },
    { username: env.CAPITAL_HUMANO_1_USER, password: env.CAPITAL_HUMANO_1_PASSWORD, displayName: 'Capital Humano 1', role: 'capital_humano' },
    { username: env.CAPITAL_HUMANO_2_USER, password: env.CAPITAL_HUMANO_2_PASSWORD, displayName: 'Capital Humano 2', role: 'capital_humano' }
  ]
    .filter((user) => user.username && user.password)
    .map((user) => ({ ...user, username: normalizeUsername(user.username) }));

  return configuredUsers.filter((user, index, users) => {
    return users.findIndex((candidate) => candidate.username === user.username) === index;
  });
}

async function ensureAdminUsersTable(connection = pool) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS chc_admin_users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      username VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
      display_name VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
      password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      role ENUM('admin', 'capital_humano') NOT NULL DEFAULT 'capital_humano',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      last_login_at DATETIME NULL,
      created_by VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_chc_admin_users_username (username),
      KEY idx_chc_admin_users_role_active (role, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);
}

async function bootstrapConfiguredUsers() {
  await ensureAdminUsersTable();
  const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM chc_admin_users');
  if (Number(countRows[0]?.total || 0) > 0) return { created: 0, skipped: true };

  const configuredUsers = getConfiguredUsers();
  if (!configuredUsers.length) return { created: 0, skipped: false };

  const connection = await pool.getConnection();
  let lockAcquired = false;
  try {
    const [lockRows] = await connection.query("SELECT GET_LOCK('chc_admin_users_bootstrap', 5) AS acquired");
    lockAcquired = Number(lockRows[0]?.acquired || 0) === 1;
    if (!lockAcquired) return { created: 0, skipped: true };

    const [lockedRows] = await connection.query('SELECT COUNT(*) AS total FROM chc_admin_users');
    if (Number(lockedRows[0]?.total || 0) > 0) return { created: 0, skipped: true };

    await connection.beginTransaction();
    let created = 0;
    for (const user of configuredUsers) {
      const passwordHash = await hashPassword(user.password, { enforcePolicy: false });
      await connection.query(
        `INSERT INTO chc_admin_users
          (username, display_name, password_hash, role, is_active, created_by)
         VALUES (?, ?, ?, ?, 1, 'BOOTSTRAP_ENV')`,
        [user.username, user.displayName, passwordHash, user.role]
      );
      created += 1;
    }
    await connection.commit();
    return { created, skipped: false };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    if (lockAcquired) {
      await connection.query("SELECT RELEASE_LOCK('chc_admin_users_bootstrap')").catch(() => {});
    }
    connection.release();
  }
}

async function initialize() {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      await ensureAdminUsersTable();
      return bootstrapConfiguredUsers();
    })().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }
  return initializationPromise;
}

async function authenticate(username, password) {
  await initialize();
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || !password) return null;

  const [rows] = await pool.query(
    `SELECT id, username, display_name, password_hash, role, is_active
     FROM chc_admin_users
     WHERE username = ?
     LIMIT 1`,
    [normalizedUsername]
  );
  const user = rows[0];
  if (!user || Number(user.is_active) !== 1) return null;
  if (!(await verifyPassword(password, user.password_hash))) return null;

  await pool.query('UPDATE chc_admin_users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  return {
    id: Number(user.id),
    username: user.username,
    displayName: user.display_name || user.username,
    role: user.role,
    source: 'database'
  };
}


async function getSessionUser(id) {
  await initialize();
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  const [rows] = await pool.query(
    `SELECT id, username, display_name, role, is_active
     FROM chc_admin_users
     WHERE id = ?
     LIMIT 1`,
    [numericId]
  );
  const user = rows[0];
  if (!user || Number(user.is_active) !== 1) return null;
  return {
    id: Number(user.id),
    username: user.username,
    displayName: user.display_name || user.username,
    role: user.role
  };
}

async function listUsers() {
  await initialize();
  const [rows] = await pool.query(`
    SELECT id, username, display_name, role, is_active, last_login_at, created_by, created_at, updated_at
    FROM chc_admin_users
    ORDER BY is_active DESC, role = 'admin' DESC, username ASC
  `);
  return rows;
}

async function createUser({ username, displayName, password, role }, actor) {
  await initialize();
  const normalizedUsername = normalizeUsername(username);
  if (!/^[a-z0-9._-]{3,80}$/.test(normalizedUsername)) {
    throw new Error('El usuario debe tener de 3 a 80 caracteres y usar solo letras, números, punto, guion o guion bajo.');
  }
  const passwordHash = await hashPassword(password);
  try {
    const [result] = await pool.query(
      `INSERT INTO chc_admin_users
        (username, display_name, password_hash, role, is_active, created_by)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [normalizedUsername, normalizeDisplayName(displayName) || normalizedUsername, passwordHash, normalizeRole(role), String(actor || 'admin').slice(0, 100)]
    );
    return Number(result.insertId);
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') throw new Error('Ya existe un usuario con ese nombre.');
    throw error;
  }
}

async function updateUser(id, { displayName, role, isActive }, currentUserId) {
  await initialize();
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) throw new Error('Usuario no válido.');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT id, username, role, is_active FROM chc_admin_users WHERE id = ? FOR UPDATE',
      [numericId]
    );
    const target = rows[0];
    if (!target) throw new Error('El usuario ya no existe.');

    const nextRole = normalizeRole(role);
    const nextActive = String(isActive) === '1' || isActive === true || isActive === 1 ? 1 : 0;
    if (Number(currentUserId) === numericId && (nextActive !== 1 || nextRole !== target.role)) {
      throw new Error('No puedes desactivar tu propia cuenta ni cambiar tu propio rol desde esta pantalla.');
    }

    const removesActiveAdmin = target.role === 'admin' && Number(target.is_active) === 1 && (nextRole !== 'admin' || nextActive !== 1);
    if (removesActiveAdmin) {
      const [adminRows] = await connection.query(
        `SELECT COUNT(*) AS total FROM chc_admin_users WHERE role = 'admin' AND is_active = 1`
      );
      if (Number(adminRows[0]?.total || 0) <= 1) throw new Error('Debe existir por lo menos un administrador activo.');
    }

    await connection.query(
      `UPDATE chc_admin_users SET display_name = ?, role = ?, is_active = ? WHERE id = ?`,
      [normalizeDisplayName(displayName) || target.username, nextRole, nextActive, numericId]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function resetPassword(id, newPassword) {
  await initialize();
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) throw new Error('Usuario no válido.');
  const passwordHash = await hashPassword(newPassword);
  const [result] = await pool.query('UPDATE chc_admin_users SET password_hash = ? WHERE id = ?', [passwordHash, numericId]);
  if (!result.affectedRows) throw new Error('El usuario ya no existe.');
}

module.exports = {
  authenticate,
  bootstrapConfiguredUsers,
  createUser,
  ensureAdminUsersTable,
  getConfiguredUsers,
  getSessionUser,
  hashPassword,
  initialize,
  listUsers,
  normalizeRole,
  normalizeUsername,
  resetPassword,
  updateUser,
  verifyPassword
};
