const db = require('../db/connection');

async function auditLog(userId, action, resource, details = {}) {
  try {
    await db.run(
      `INSERT INTO audit_logs (user_id, action, resource, details)
       VALUES (?, ?, ?, ?)`,
      [
        userId || null,
        action,
        resource,
        JSON.stringify(details)
      ]
    );
  } catch (error) {
    console.error('Audit logging error:', error);
    // Don't throw - audit logging failure shouldn't break the app
  }
}

async function getAuditLogs(filters = {}) {
  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];

  if (filters.userId) {
    query += ' AND user_id = ?';
    params.push(filters.userId);
  }

  if (filters.action) {
    query += ' AND action = ?';
    params.push(filters.action);
  }

  if (filters.resource) {
    query += ' AND resource = ?';
    params.push(filters.resource);
  }

  if (filters.startDate) {
    query += ' AND timestamp >= ?';
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    query += ' AND timestamp <= ?';
    params.push(filters.endDate);
  }

  query += ' ORDER BY timestamp DESC LIMIT 1000';

  return db.all(query, params);
}

module.exports = {
  auditLog,
  getAuditLogs
};
