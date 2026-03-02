const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { PERMISSIONS } = require('../constants/permissions');
const AuthProvider = require('../auth/authProvider');
const { auditLog } = require('../utils/auditLog');

const authProvider = new AuthProvider(process.env.AUTH_PROVIDER || 'local');

// GET /api/users/me - Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    res.json(req.user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users - List all users (admin/manager only)
router.get('/', authenticate, authorize(PERMISSIONS.USER_VIEW), async (req, res) => {
  try {
    const users = await db.all(
      `SELECT u.id, u.email, u.name, u.is_active, u.created_at,
              GROUP_CONCAT(r.name, ', ') as roles
       FROM users u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );

    const formatted = users.map(u => ({
      ...u,
      roles: u.roles ? u.roles.split(', ') : []
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/users - Create new user (admin only)
router.post('/', authenticate, authorize(PERMISSIONS.USER_CREATE), async (req, res) => {
  try {
    const { email, name, password, roles } = req.body;

    const user = await authProvider.createUser({
      email,
      name,
      password,
      roles: roles || ['viewer']
    });

    await auditLog(req.user.id, 'USER_CREATED', 'user', { userId: user.id, email });

    res.status(201).json(user);
  } catch (error) {
    await auditLog(req.user.id, 'USER_CREATE_FAILED', 'user', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/users/:userId/roles - Update user roles (admin only)
router.put('/:userId/roles', authenticate, authorize(PERMISSIONS.ROLE_MANAGE), async (req, res) => {
  try {
    const { userId } = req.params;
    const { roles } = req.body;

    if (!roles || !Array.isArray(roles)) {
      return res.status(400).json({ error: 'Roles must be an array' });
    }

    // Remove existing roles
    await db.run('DELETE FROM user_roles WHERE user_id = ?', [userId]);

    // Add new roles
    for (const roleName of roles) {
      const role = await db.get('SELECT id FROM roles WHERE name = ?', [roleName]);
      if (role) {
        await db.run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, role.id]);
      }
    }

    await auditLog(req.user.id, 'USER_ROLES_UPDATED', 'user', { userId, roles });

    res.json({ message: 'User roles updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/users/:userId - Deactivate user (admin only)
router.delete('/:userId', authenticate, authorize(PERMISSIONS.USER_DELETE), async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent deleting self
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    await db.run('UPDATE users SET is_active = 0 WHERE id = ?', [userId]);

    await auditLog(req.user.id, 'USER_DEACTIVATED', 'user', { userId });

    res.json({ message: 'User deactivated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
