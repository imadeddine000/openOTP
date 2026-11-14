/**
 * Simple API-key authentication middleware.
 *
 * The server reads the key from the API_KEY environment variable.
 * If API_KEY is not set, auth is disabled (open mode — useful for dev).
 *
 * REST:   clients send  Authorization: Bearer <key>
 * Socket: clients send  { auth: { key: "<key>" } } in the handshake
 */

const API_KEY = process.env.API_KEY || null;

/**
 * Express middleware — protects REST API routes.
 * Skips auth when API_KEY is not configured.
 */
function restAuth(req, res, next) {
  if (!API_KEY) return next(); // open mode

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (token === API_KEY) return next();

  return res.status(401).json({ error: 'Unauthorized: invalid or missing API key' });
}

/**
 * Socket.io middleware — protects WebSocket connections.
 * Skips auth when API_KEY is not configured.
 * Devices must pass { auth: { key: "..." } } when connecting.
 */
function socketAuth(socket, next) {
  if (!API_KEY) return next(); // open mode

  const key = (socket.handshake.auth && socket.handshake.auth.key) || null;
  if (key === API_KEY) return next();

  console.log(`[AUTH] Socket ${socket.id} rejected — invalid API key`);
  return next(new Error('Unauthorized: invalid or missing API key'));
}

module.exports = { restAuth, socketAuth, isAuthEnabled: () => !!API_KEY };