/**
 * User auth routes for the openOTP SaaS dashboard.
 *   POST /api/auth/register   { email, password } -> { user, token }
 *   POST /api/auth/login      { email, password } -> { user, token }
 *   GET  /api/auth/me         -> { user }
 *   POST /api/auth/api-key    -> rotate API key -> { user }
 */
const express = require('express');
const router = express.Router();
const store = require('../services/store');
const { authUser, signToken } = require('../middleware/auth');

router.post('/register', (req, res) => {
  try {
    const user = store.createUser({ email: req.body.email, password: req.body.password });
    const token = signToken(user.id);
    res.status(201).json({ data: { user: store.publicUser(user), token } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/login', (req, res) => {
  const user = store.findUserByEmail(req.body.email);
  if (!user || !store.verifyPassword(req.body.password || '', user.salt, user.hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = signToken(user.id);
  res.json({ data: { user: store.publicUser(user), token } });
});

router.get('/me', authUser, (req, res) => {
  res.json({ data: store.publicUser(req.user) });
});

router.post('/api-key', authUser, (req, res) => {
  const user = store.rotateApiKey(req.user.id);
  res.json({ data: store.publicUser(user) });
});

module.exports = router;
