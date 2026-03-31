/**
 * Simple Authentication System for Mini ERP
 * Consolidated module - Database, JWT, Auth logic all in one
 * Uses SQLite (file-based, no setup needed)
 */

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

// Database path
const dbPath = path.join(__dirname, '..', '..', 'data', 'mini_erp.db');
const dataDir = path.join(__dirname, '..', '..', 'data');
const legacyAuthDbPath = path.join(__dirname, '..', 'data', 'mini_erp.db');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// JWT Secret - change this in production!
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
const JWT_EXPIRY = '48h';
const CORPORATE_EMAIL_DOMAIN = 'pfnonwovens.com';
const DEFAULT_ACCESS_GROUP_NAME = 'General Access';

// ==================== DATABASE ====================

let db = null;

function getDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ Database error:', err);
        reject(err);
      } else {
        db.run('PRAGMA foreign_keys = ON', (err) => {
          if (err) reject(err);
          else resolve(db);
        });
      }
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDB().then(db => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDB().then(db => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDB().then(db => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  });
}

function legacyPathNeedsMigration() {
  return path.resolve(legacyAuthDbPath) !== path.resolve(dbPath) && fs.existsSync(legacyAuthDbPath);
}

async function getLegacyAuthTables() {
  if (!legacyPathNeedsMigration()) {
    return [];
  }

  return new Promise((resolve, reject) => {
    const legacyDb = new sqlite3.Database(legacyAuthDbPath, (openErr) => {
      if (openErr) {
        reject(openErr);
        return;
      }

      legacyDb.all(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table'
           AND name IN ('users', 'audit_logs', 'groups', 'user_groups', 'access_requests')
         ORDER BY name`,
        (queryErr, rows) => {
          legacyDb.close(() => {
            if (queryErr) reject(queryErr);
            else resolve(rows || []);
          });
        }
      );
    });
  });
}

async function migrateLegacyAuthDatabase() {
  const legacyTables = await getLegacyAuthTables();
  if (!legacyTables.length) {
    return { migrated: false, tableCount: 0 };
  }

  const tableNames = new Set(legacyTables.map((row) => row.name));
  const legacyPathLiteral = `'${legacyAuthDbPath.replace(/'/g, "''")}'`;

  await dbRun(`ATTACH DATABASE ${legacyPathLiteral} AS legacy_auth`);
  try {
    if (tableNames.has('users')) {
      await dbRun(`
        INSERT OR IGNORE INTO users (id, email, name, password_hash, role, is_active, created_at)
        SELECT id, email, name, password_hash, role, COALESCE(is_active, 1), COALESCE(created_at, CURRENT_TIMESTAMP)
        FROM legacy_auth.users
      `);
    }

    if (tableNames.has('groups')) {
      await dbRun(`
        INSERT OR IGNORE INTO groups (id, name, description, permissions, created_at)
        SELECT id, name, description, COALESCE(permissions, '[]'), COALESCE(created_at, CURRENT_TIMESTAMP)
        FROM legacy_auth.groups
      `);
    }

    if (tableNames.has('user_groups')) {
      await dbRun(`
        INSERT OR IGNORE INTO user_groups (id, user_id, group_id, added_at)
        SELECT ug.id, ug.user_id, ug.group_id, COALESCE(ug.added_at, CURRENT_TIMESTAMP)
        FROM legacy_auth.user_groups ug
        JOIN users u ON u.id = ug.user_id
        JOIN groups g ON g.id = ug.group_id
      `);
    }

    if (tableNames.has('access_requests')) {
      await dbRun(`
        INSERT OR IGNORE INTO access_requests (
          id, email, full_name, reason, status, requested_at, reviewed_by, reviewed_at, notes
        )
        SELECT ar.id,
               ar.email,
               ar.full_name,
               ar.reason,
               ar.status,
               ar.requested_at,
               CASE WHEN reviewer.id IS NOT NULL THEN ar.reviewed_by ELSE NULL END,
               ar.reviewed_at,
               ar.notes
        FROM legacy_auth.access_requests ar
        LEFT JOIN users reviewer ON reviewer.id = ar.reviewed_by
      `);
    }

    if (tableNames.has('audit_logs')) {
      await dbRun(`
        INSERT OR IGNORE INTO audit_logs (id, user_id, action, resource, details, timestamp)
        SELECT al.id,
               CASE WHEN u.id IS NOT NULL THEN al.user_id ELSE NULL END,
               al.action,
               al.resource,
               al.details,
               COALESCE(al.timestamp, CURRENT_TIMESTAMP)
        FROM legacy_auth.audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
      `);
    }
  } finally {
    await dbRun('DETACH DATABASE legacy_auth');
  }

  return { migrated: true, tableCount: tableNames.size };
}

// ==================== DATABASE INITIALIZATION ====================

async function initializeDatabase() {
  try {
    // Users table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'viewer',
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Audit logs table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        user_id TEXT,
        action TEXT NOT NULL,
        resource TEXT,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Groups table - for future group-based access management
    await dbRun(`
      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        permissions TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // User-Group mapping table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS user_groups (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        user_id TEXT NOT NULL,
        group_id TEXT NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
        UNIQUE(user_id, group_id)
      )
    `);

    // Access requests table - for @pfnonwovens.com users to request access
    await dbRun(`
      CREATE TABLE IF NOT EXISTS access_requests (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        email TEXT NOT NULL,
        full_name TEXT NOT NULL,
        reason TEXT,
        status TEXT DEFAULT 'pending',
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reviewed_by TEXT,
        reviewed_at DATETIME,
        notes TEXT,
        FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    const migrationResult = await migrateLegacyAuthDatabase();
    if (migrationResult.migrated) {
      console.log(`✓ Legacy auth database migrated from src/data to shared data DB (${migrationResult.tableCount} table(s))`);
    }

    console.log('✓ Database schema initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}

// ==================== PASSWORD HASHING ====================

async function hashPassword(password) {
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// ==================== JWT TOKENS ====================

function issueToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function extractToken(req) {
  const bearerToken = req.headers.authorization?.split(' ')[1];
  if (bearerToken) return bearerToken;
  return req.cookies?.authToken || null;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function parsePermissions(rawPermissions) {
  try {
    const parsed = JSON.parse(rawPermissions || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function normalizePermissions(permissions) {
  if (!Array.isArray(permissions)) {
    return [];
  }

  const cleaned = permissions
    .map((permission) => String(permission || '').trim())
    .filter(Boolean);

  return Array.from(new Set(cleaned));
}

function isCorporateEmail(email) {
  return normalizeEmail(email).endsWith(`@${CORPORATE_EMAIL_DOMAIN}`);
}

async function ensureDefaultAccessGroup() {
  const existingGroup = await dbGet('SELECT id FROM groups WHERE name = ?', [DEFAULT_ACCESS_GROUP_NAME]);
  if (existingGroup) {
    return existingGroup.id;
  }

  await dbRun(
    'INSERT INTO groups (name, description, permissions) VALUES (?, ?, ?)',
    [DEFAULT_ACCESS_GROUP_NAME, 'Baseline access group for active users', JSON.stringify([])]
  );

  const createdGroup = await dbGet('SELECT id FROM groups WHERE name = ?', [DEFAULT_ACCESS_GROUP_NAME]);
  return createdGroup.id;
}

async function ensureUserHasDefaultGroup(userId) {
  const groupId = await ensureDefaultAccessGroup();
  const existingMembership = await dbGet(
    'SELECT id FROM user_groups WHERE user_id = ? AND group_id = ?',
    [userId, groupId]
  );

  if (!existingMembership) {
    await dbRun(
      'INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)',
      [userId, groupId]
    );
  }
}

// ==================== AUTHENTICATION ====================

async function login(email, password) {
  if (!email || !password) {
    throw new Error('Email and password required');
  }

  const normalizedEmail = normalizeEmail(email);

  if (!isCorporateEmail(normalizedEmail)) {
    await auditLog(null, 'LOGIN_FAILED', 'auth', { email: normalizedEmail, reason: 'invalid_domain' });
    throw new Error(`Only @${CORPORATE_EMAIL_DOMAIN} email addresses can log in`);
  }

  const user = await dbGet(
    'SELECT * FROM users WHERE email = ? AND is_active = 1',
    [normalizedEmail]
  );

  if (!user) {
    await auditLog(null, 'LOGIN_FAILED', 'auth', { email: normalizedEmail, reason: 'user_not_found' });
    throw new Error('User not found');
  }

  const membership = await dbGet(
    'SELECT COUNT(*) as count FROM user_groups WHERE user_id = ?',
    [user.id]
  );

  if (!membership || membership.count < 1) {
    await auditLog(user.id, 'LOGIN_FAILED', 'auth', { email: normalizedEmail, reason: 'no_group_membership' });
    throw new Error('User is not assigned to an access group');
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    await auditLog(null, 'LOGIN_FAILED', 'auth', { email: normalizedEmail, reason: 'invalid_password' });
    throw new Error('Invalid password');
  }

  const token = issueToken(user);
  await auditLog(user.id, 'LOGIN_SUCCESS', 'auth', { email: normalizedEmail });

  return {
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    }
  };
}

async function createUser(email, name, password, role = 'viewer') {
  if (!email || !name || !password) {
    throw new Error('Email, name, and password required');
  }

  const normalizedEmail = normalizeEmail(email);

  // Validate email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Invalid email format');
  }

  if (!isCorporateEmail(normalizedEmail)) {
    throw new Error(`Only @${CORPORATE_EMAIL_DOMAIN} email addresses are allowed`);
  }

  // Check if exists
  const existing = await dbGet('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
  if (existing) {
    throw new Error('Email already in use');
  }

  // Validate role
  const validRoles = ['admin', 'analyst', 'engineer', 'viewer'];
  if (!validRoles.includes(role)) {
    throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
  }

  const passwordHash = await hashPassword(password);
  await dbRun(
    'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)',
    [normalizedEmail, name, passwordHash, role]
  );

  const createdUser = await dbGet('SELECT id, email, name, role FROM users WHERE email = ?', [normalizedEmail]);

  await ensureUserHasDefaultGroup(createdUser.id);

  return {
    id: createdUser.id,
    email: createdUser.email,
    name: createdUser.name,
    role: createdUser.role
  };
}

async function getCurrentUser(userId) {
  const user = await dbGet(
    'SELECT id, email, name, role, is_active, created_at FROM users WHERE id = ?',
    [userId]
  );

  if (!user) return null;
  return user;
}

// ==================== AUDIT LOGGING ====================

async function auditLog(userId, action, resource, details = {}) {
  try {
    await dbRun(
      'INSERT INTO audit_logs (user_id, action, resource, details) VALUES (?, ?, ?, ?)',
      [userId || null, action, resource, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

// ==================== PERMISSIONS ====================

const ROLES = {
  admin: ['bom:view', 'bom:calculate', 'bom:export', 'user:manage', 'system:admin'],
  analyst: ['bom:view', 'bom:calculate', 'bom:export'],
  engineer: ['bom:view', 'bom:calculate', 'product:edit'],
  viewer: ['bom:view']
};

function hasPermission(userRole, permission) {
  const permissions = ROLES[userRole] || [];
  return permissions.includes(permission);
}

// ==================== MIDDLEWARE ====================

function authMiddleware(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: 'No authentication token' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!hasPermission(req.user.role, permission)) {
      auditLog(req.user.id, 'UNAUTHORIZED_ACCESS', req.path, { permission });
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

// ==================== ACCESS REQUEST MANAGEMENT ====================

async function requestAccess(email, fullName, reason = '') {
  if (!email || !fullName) {
    throw new Error('Email and full name required');
  }

  const normalizedEmail = normalizeEmail(email);

  // Validate email is @pfnonwovens.com
  if (!isCorporateEmail(normalizedEmail)) {
    throw new Error('Only @pfnonwovens.com email addresses can request access');
  }

  // Check if email already has an account
  const existing = await dbGet('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
  if (existing) {
    throw new Error('User already has an account');
  }

  // Check if already has pending request
  const pending = await dbGet(
    'SELECT id FROM access_requests WHERE email = ? AND status = ?',
    [normalizedEmail, 'pending']
  );
  if (pending) {
    throw new Error('You already have a pending access request');
  }

  // Create access request
  const result = await dbRun(
    'INSERT INTO access_requests (email, full_name, reason) VALUES (?, ?, ?)',
    [normalizedEmail, fullName, reason]
  );

  await auditLog(null, 'ACCESS_REQUEST', 'access', { email: normalizedEmail, fullName });

  return {
    id: result.id,
    email: normalizedEmail,
    fullName,
    status: 'pending',
    requested_at: new Date().toISOString()
  };
}

async function getAccessRequests(status = null) {
  let sql = 'SELECT * FROM access_requests';
  let params = [];

  if (status) {
    sql += ' WHERE status = ?';
    params = [status];
  }

  sql += ' ORDER BY requested_at DESC';

  return dbAll(sql, params);
}

async function approveAccessRequest(requestId, adminUserId) {
  const request = await dbGet('SELECT * FROM access_requests WHERE id = ?', [requestId]);

  if (!request) {
    throw new Error('Access request not found');
  }

  if (request.status !== 'pending') {
    throw new Error(`Cannot approve request with status: ${request.status}`);
  }

  // Create user account with a default temporary password
  const tempPassword = Math.random().toString(36).slice(-12);
  const passwordHash = await hashPassword(tempPassword);

  await dbRun(
    'INSERT INTO users (email, name, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)',
    [request.email, request.full_name, passwordHash, 'viewer', 1]
  );

  const createdUser = await dbGet('SELECT id FROM users WHERE email = ?', [request.email]);

  await ensureUserHasDefaultGroup(createdUser.id);

  // Update request status
  await dbRun(
    'UPDATE access_requests SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?',
    ['approved', adminUserId, new Date().toISOString(), requestId]
  );

  await auditLog(adminUserId, 'ACCESS_REQUEST_APPROVED', 'access', {
    email: request.email,
    userId: createdUser.id
  });

  return {
    userId: createdUser.id,
    email: request.email,
    name: request.full_name,
    tempPassword,
    message: 'User account created. Please share temporary password securely.'
  };
}

async function denyAccessRequest(requestId, adminUserId, reason = '') {
  const request = await dbGet('SELECT * FROM access_requests WHERE id = ?', [requestId]);

  if (!request) {
    throw new Error('Access request not found');
  }

  if (request.status !== 'pending') {
    throw new Error(`Cannot deny request with status: ${request.status}`);
  }

  await dbRun(
    'UPDATE access_requests SET status = ?, reviewed_by = ?, reviewed_at = ?, notes = ? WHERE id = ?',
    ['denied', adminUserId, new Date().toISOString(), reason, requestId]
  );

  await auditLog(adminUserId, 'ACCESS_REQUEST_DENIED', 'access', {
    email: request.email,
    reason
  });

  return { status: 'denied', email: request.email };
}

// ==================== GROUP MANAGEMENT ====================

async function createGroup(name, description = '', permissions = []) {
  const existing = await dbGet('SELECT id FROM groups WHERE name = ?', [name]);
  if (existing) {
    throw new Error('Group already exists');
  }

  const normalizedGroupPermissions = normalizePermissions(permissions);

  const result = await dbRun(
    'INSERT INTO groups (name, description, permissions) VALUES (?, ?, ?)',
    [name, description, JSON.stringify(normalizedGroupPermissions)]
  );

  return {
    id: result.id,
    name,
    description,
    permissions: normalizedGroupPermissions
  };
}

async function getGroups() {
  const groups = await dbAll('SELECT * FROM groups ORDER BY name');
  return groups.map(g => ({
    ...g,
    permissions: parsePermissions(g.permissions)
  }));
}

async function addUserToGroup(userId, groupId) {
  // Verify user exists
  const user = await dbGet('SELECT id FROM users WHERE id = ?', [userId]);
  if (!user) {
    throw new Error('User not found');
  }

  // Verify group exists
  const group = await dbGet('SELECT id FROM groups WHERE id = ?', [groupId]);
  if (!group) {
    throw new Error('Group not found');
  }

  // Add user to group
  try {
    await dbRun(
      'INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)',
      [userId, groupId]
    );
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      throw new Error('User is already in this group');
    }
    throw err;
  }

  return { userId, groupId, status: 'added' };
}

async function removeUserFromGroup(userId, groupId) {
  await dbRun(
    'DELETE FROM user_groups WHERE user_id = ? AND group_id = ?',
    [userId, groupId]
  );

  return { userId, groupId, status: 'removed' };
}

async function getUserGroups(userId) {
  const groups = await dbAll(
    `SELECT g.* FROM groups g
     JOIN user_groups ug ON g.id = ug.group_id
     WHERE ug.user_id = ?
     ORDER BY g.name`,
    [userId]
  );

  return groups.map(g => ({
    ...g,
    permissions: parsePermissions(g.permissions)
  }));
}

async function updateGroup(groupId, name, description = '', permissions = null) {
  // Verify group exists
  const group = await dbGet('SELECT id FROM groups WHERE id = ?', [groupId]);
  if (!group) {
    throw new Error('Group not found');
  }

  // Check if new name is already taken by another group
  const existing = await dbGet('SELECT id FROM groups WHERE name = ? AND id != ?', [name, groupId]);
  if (existing) {
    throw new Error('Group name already exists');
  }

  const updates = ['name = ?', 'description = ?'];
  const params = [name, description];

  if (permissions !== null) {
    updates.push('permissions = ?');
    params.push(JSON.stringify(normalizePermissions(permissions)));
  }

  params.push(groupId);

  await dbRun(
    `UPDATE groups SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

  const updated = await dbGet('SELECT * FROM groups WHERE id = ?', [groupId]);
  return {
    id: updated.id,
    name: updated.name,
    description: updated.description,
    permissions: parsePermissions(updated.permissions)
  };
}

async function deleteGroup(groupId) {
  // Verify group exists
  const group = await dbGet('SELECT id FROM groups WHERE id = ?', [groupId]);
  if (!group) {
    throw new Error('Group not found');
  }

  // Remove all users from group
  await dbRun('DELETE FROM user_groups WHERE group_id = ?', [groupId]);

  // Delete group
  await dbRun('DELETE FROM groups WHERE id = ?', [groupId]);

  return { id: groupId, status: 'deleted' };
}

async function getUsersInGroup(groupId) {
  // Verify group exists
  const group = await dbGet('SELECT id FROM groups WHERE id = ?', [groupId]);
  if (!group) {
    throw new Error('Group not found');
  }

  const users = await dbAll(
    `SELECT u.id, u.email, u.name, u.role FROM users u
     JOIN user_groups ug ON u.id = ug.user_id
     WHERE ug.group_id = ?
     ORDER BY u.name`,
    [groupId]
  );

  return users;
}

async function getAllUsers() {
  const users = await dbAll(
    `SELECT u.id, u.email, u.name, u.role, u.created_at,
            GROUP_CONCAT(g.name) as groups,
            GROUP_CONCAT(g.id) as group_ids
     FROM users u
     LEFT JOIN user_groups ug ON u.id = ug.user_id
     LEFT JOIN groups g ON ug.group_id = g.id
     GROUP BY u.id
     ORDER BY u.name`,
    []
  );

  // Parse group info into arrays
  return users.map(user => ({
    ...user,
    groups: user.groups ? user.groups.split(',') : [],
    group_ids: user.group_ids ? user.group_ids.split(',').map(Number) : []
  }));
}

async function createDirectUser(email, fullName, password, groupId = null) {
  const normalizedEmail = normalizeEmail(email);

  // Validate email format
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error('Invalid email address');
  }

  if (!isCorporateEmail(normalizedEmail)) {
    throw new Error(`Only @${CORPORATE_EMAIL_DOMAIN} email addresses are allowed`);
  }

  // Check if user already exists
  const existing = await dbGet('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
  if (existing) {
    throw new Error('Email already in use');
  }

  // Verify group exists if groupId provided
  if (groupId) {
    const group = await dbGet('SELECT id FROM groups WHERE id = ?', [groupId]);
    if (!group) {
      throw new Error('Group not found');
    }
  }

  // Hash password
  const hashedPassword = await hashPassword(password);
  const userId = require('uuid').v4();

  // Create user with viewer role by default
  const result = await dbRun(
    'INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, normalizedEmail, fullName, hashedPassword, 'viewer', new Date().toISOString()]
  );

  // Add to group if provided
  if (groupId) {
    await dbRun(
      'INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)',
      [userId, groupId]
    );
  } else {
    await ensureUserHasDefaultGroup(userId);
  }

  // Log audit event
  await auditLog(userId, 'user_created', 'users', { email: normalizedEmail, name: fullName });

  return {
    id: userId,
    email: normalizedEmail,
    name: fullName,
    role: 'viewer',
    groupId: groupId || null
  };
}

async function updateUser(userId, email, fullName, password = null) {
  // Check if user exists
  const user = await dbGet('SELECT id, email FROM users WHERE id = ?', [userId]);
  if (!user) {
    throw new Error('User not found');
  }

  // Validate email format
  const normalizedEmail = email ? normalizeEmail(email) : null;

  if (normalizedEmail && !normalizedEmail.includes('@')) {
    throw new Error('Invalid email address');
  }

  if (normalizedEmail && !isCorporateEmail(normalizedEmail)) {
    throw new Error(`Only @${CORPORATE_EMAIL_DOMAIN} email addresses are allowed`);
  }

  // Check if new email is already in use by another user
  if (normalizedEmail && normalizedEmail !== user.email) {
    const existing = await dbGet('SELECT id FROM users WHERE email = ? AND id != ?', [normalizedEmail, userId]);
    if (existing) {
      throw new Error('Email already in use');
    }
  }

  // Prepare update query and values
  let updateQuery = 'UPDATE users SET ';
  let updateFields = [];
  let updateValues = [];

  if (normalizedEmail) {
    updateFields.push('email = ?');
    updateValues.push(normalizedEmail);
  }

  if (fullName) {
    updateFields.push('name = ?');
    updateValues.push(fullName);
  }

  if (password) {
    const hashedPassword = await hashPassword(password);
    updateFields.push('password_hash = ?');
    updateValues.push(hashedPassword);
  }

  // Add user ID to the values array
  updateValues.push(userId);

  updateQuery += updateFields.join(', ') + ' WHERE id = ?';

  // Execute update
  await dbRun(updateQuery, updateValues);

  // Log audit event
  await auditLog(userId, 'user_updated', 'users', { email, name: fullName });

  return {
    id: userId,
    email: normalizedEmail || user.email,
    name: fullName
  };
}

// ==================== PASSWORD CHANGE ====================

async function changePassword(userId, currentPassword, newPassword) {
  try {
    // Get user's current password hash
    const user = await dbGet('SELECT id, email, password_hash FROM users WHERE id = ?', [userId]);
    
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Verify current password
    const isValid = await verifyPassword(currentPassword, user.password_hash);
    if (!isValid) {
      return { success: false, error: 'Current password is incorrect' };
    }

    // Hash new password
    const newHash = await hashPassword(newPassword);

    // Update password in database
    await dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);

    // Log the change
    await auditLog(userId, 'CHANGE_PASSWORD', 'users', { email: user.email });

    return { success: true, message: 'Password changed successfully' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ==================== AUDIT LOGS VIEWER ====================

async function getAuditLogs(filters = {}) {
  try {
    let query = `
      SELECT 
        al.id,
        al.timestamp,
        al.action,
        al.resource,
        al.details,
        al.user_id,
        u.email as user_email,
        u.name as user_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Filter by user ID
    if (filters.userId) {
      query += ' AND al.user_id = ?';
      params.push(filters.userId);
    }
    
    // Filter by action
    if (filters.action) {
      query += ' AND al.action = ?';
      params.push(filters.action);
    }
    
    // Filter by resource
    if (filters.resource) {
      query += ' AND al.resource = ?';
      params.push(filters.resource);
    }
    
    // Filter by date range
    if (filters.startDate) {
      query += ' AND al.timestamp >= ?';
      params.push(filters.startDate);
    }
    
    if (filters.endDate) {
      query += ' AND al.timestamp <= ?';
      params.push(filters.endDate);
    }
    
    // Search in details
    if (filters.search) {
      query += ' AND (al.details LIKE ? OR u.email LIKE ? OR al.action LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    // Order by timestamp descending
    query += ' ORDER BY al.timestamp DESC';
    
    // Limit results
    const limit = filters.limit || 100;
    query += ' LIMIT ?';
    params.push(limit);
    
    const logs = await dbAll(query, params);
    
    // Parse JSON details for each log
    return logs.map(log => ({
      ...log,
      details: log.details ? JSON.parse(log.details) : {}
    }));
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    throw err;
  }
}

async function getAuditLogStats() {
  try {
    const stats = await dbGet(`
      SELECT 
        COUNT(*) as total_logs,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT action) as unique_actions,
        MAX(timestamp) as last_activity
      FROM audit_logs
    `);
    
    return stats;
  } catch (err) {
    console.error('Error fetching audit log stats:', err);
    throw err;
  }
}

// ==================== EXPORTS ====================

module.exports = {
  // Core auth
  login,
  createUser,
  getCurrentUser,
  verifyToken,
  issueToken,
  extractToken,

  // Database
  dbRun,
  dbGet,
  dbAll,
  initializeDatabase,

  // Middleware
  authMiddleware,
  requirePermission,

  // Access requests
  requestAccess,
  getAccessRequests,
  approveAccessRequest,
  denyAccessRequest,

  // Groups
  createGroup,
  getGroups,
  addUserToGroup,
  removeUserFromGroup,
  getUserGroups,
  updateGroup,
  deleteGroup,
  getUsersInGroup,
  getAllUsers,
  createDirectUser,
  updateUser,
  changePassword,

  // Audit logs
  getAuditLogs,
  getAuditLogStats,

  // Utilities
  auditLog,
  hasPermission,
  ROLES
};
