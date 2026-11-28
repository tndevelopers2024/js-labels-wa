const express = require('express');
const router = express.Router();
const { login, register, me, logout } = require('../controllers/authController');
const { protect, optionalProtect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

router.post('/login', authLimiter, login);
router.post('/register', authLimiter, optionalProtect, register);
router.get('/me', protect, me);
router.post('/logout', logout);

module.exports = router;
