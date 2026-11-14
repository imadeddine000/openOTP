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
  if (user.enabled === false) return res.status(403).json({ error: 'Account disabled' });
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

/* ---- client API key management (multiple keys per user) ---- */
router.get('/api-keys', authUser, (req, res) => {
  res.json({ data: store.listApiKeys(req.user.id) });
});
router.post('/api-keys', authUser, (req, res) => {
  const entry = store.createApiKey(req.user.id, req.body.label);
  res.status(201).json({ data: entry });
});
router.delete('/api-keys/:id', authUser, (req, res) => {
  const ok = store.revokeApiKey(req.user.id, req.params.id);
  if (!ok) return res.status(404).json({ error: 'API key not found' });
  res.json({ data: { success: true } });
});

module.exports = router;
