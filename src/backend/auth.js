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
const dbPath = path.join(__dirname, '..', 'data', 'mini_erp.db');
const dataDir = path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// JWT Secret - change this in production!
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
const JWT_EXPIRY = '48h';

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

// ==================== AUTHENTICATION ====================

async function login(email, password) {
  if (!email || !password) {
    throw new Error('Email and password required');
  }

  const user = await dbGet(
    'SELECT * FROM users WHERE email = ? AND is_active = 1',
    [email]
  );

  if (!user) {
    await auditLog(null, 'LOGIN_FAILED', 'auth', { email, reason: 'user_not_found' });
    throw new Error('User not found');
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    await auditLog(null, 'LOGIN_FAILED', 'auth', { email, reason: 'invalid_password' });
    throw new Error('Invalid password');
  }

  const token = issueToken(user);
  await auditLog(user.id, 'LOGIN_SUCCESS', 'auth', { email });

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

  // Validate email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Invalid email format');
  }

  // Check if exists
  const existing = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    throw new Error('Email already in use');
  }

  // Validate role
  const validRoles = ['admin', 'analyst', 'engineer', 'viewer'];
  if (!validRoles.includes(role)) {
    throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
  }

  const passwordHash = await hashPassword(password);
  const result = await dbRun(
    'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)',
    [email, name, passwordHash, role]
  );

  return {
    id: result.id,
    email,
    name,
    role
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

  // Validate email is @pfnonwovens.com
  if (!email.endsWith('@pfnonwovens.com')) {
    throw new Error('Only @pfnonwovens.com email addresses can request access');
  }

  // Check if email already has an account
  const existing = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    throw new Error('User already has an account');
  }

  // Check if already has pending request
  const pending = await dbGet(
    'SELECT id FROM access_requests WHERE email = ? AND status = ?',
    [email, 'pending']
  );
  if (pending) {
    throw new Error('You already have a pending access request');
  }

  // Create access request
  const result = await dbRun(
    'INSERT INTO access_requests (email, full_name, reason) VALUES (?, ?, ?)',
    [email, fullName, reason]
  );

  await auditLog(null, 'ACCESS_REQUEST', 'access', { email, fullName });

  return {
    id: result.id,
    email,
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

  const userResult = await dbRun(
    'INSERT INTO users (email, name, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)',
    [request.email, request.full_name, passwordHash, 'viewer', 1]
  );

  // Update request status
  await dbRun(
    'UPDATE access_requests SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?',
    [adminUserId, 'approved', new Date().toISOString(), requestId]
  );

  await auditLog(adminUserId, 'ACCESS_REQUEST_APPROVED', 'access', {
    email: request.email,
    userId: userResult.id
  });

  return {
    userId: userResult.id,
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

  const result = await dbRun(
    'INSERT INTO groups (name, description, permissions) VALUES (?, ?, ?)',
    [name, description, JSON.stringify(permissions)]
  );

  return {
    id: result.id,
    name,
    description,
    permissions
  };
}

async function getGroups() {
  const groups = await dbAll('SELECT * FROM groups ORDER BY name');
  return groups.map(g => ({
    ...g,
    permissions: JSON.parse(g.permissions)
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
    permissions: JSON.parse(g.permissions)
  }));
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

  // Utilities
  auditLog,
  hasPermission,
  ROLES
};
