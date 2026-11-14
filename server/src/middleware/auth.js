/**
 * Auth middleware for openOTP SaaS.
 * - Dashboard users authenticate with a signed Bearer token (issued at login).
 * - Devices / gateway clients authenticate with an x-api-key header.
 * Tokens are HMAC-SHA256 signed JSON (no external jwt dep).
 */
const crypto = require('crypto');
const store = require('../services/store');

const SECRET = process.env.JWT_SECRET || 'openotp-dev-secret-change-me';

function signToken(userId, ttlMs = 7 * 24 * 3600 * 1000) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + ttlMs })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return payload + '.' + sig;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  if (sig !== expected) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

/** Bearer token auth for dashboard users. */
function authUser(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const data = verifyToken(token);
  if (!data) return res.status(401).json({ error: 'Unauthorized' });
  const user = store.findUserById(data.uid);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

/** Gateway auth: x-api-key header OR Bearer token. */
function authGateway(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    const user = store.findUserByApiKey(apiKey);
    if (!user) return res.status(401).json({ error: 'Invalid API key' });
    req.user = user;
    return next();
  }
  return authUser(req, res, next);
}

/** Client API auth: requires x-api-key header (the client's sk_... key). */
function authClient(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'x-api-key header is required' });
  const user = store.findUserByApiKey(apiKey);
  if (!user) return res.status(401).json({ error: 'Invalid API key' });
  req.user = user;
  next();
}

module.exports = { signToken, verifyToken, authUser, authGateway, authClient };
