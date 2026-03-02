const express = require('express');
const router = express.Router();
const AuthProvider = require('../auth/authProvider');
const { auditLog } = require('../utils/auditLog');

const authProvider = new AuthProvider(process.env.AUTH_PROVIDER || 'local');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const result = await authProvider.authenticate({ email, password });

    // Log successful login
    await auditLog(result.user.id, 'LOGIN_SUCCESS', 'auth', { email });

    res.json(result);
  } catch (error) {
    // Log failed login attempt
    await auditLog(null, 'LOGIN_FAILED', 'auth', { email: req.body.email, error: error.message });

    res.status(401).json({ error: error.message });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    if (req.user) {
      await auditLog(req.user.id, 'LOGOUT', 'auth', {});
    }
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
