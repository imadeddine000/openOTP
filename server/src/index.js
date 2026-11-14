const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const deviceHandler = require('./socket/deviceHandler');
const { isAuthEnabled } = require('./middleware/auth');

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// --- Debug: log every incoming HTTP request at the server level ---
// Must be added AFTER Socket.io attaches (it removes prior 'request' listeners)
server.on('request', (req) => {
  if (req.url.startsWith('/socket.io')) {
    console.log(`[HTTP] ${req.method} ${req.url} from ${req.socket.remoteAddress}`);
  }
});

// --- Debug: log Engine.IO-level connection errors ---
io.engine.on('connection_error', (err) => {
  console.log(`[ENGINE-ERROR] req=${err.req && err.req.method} ${err.req && err.req.url} code=${err.code} msg=${err.message} ctx=${JSON.stringify(err.context || {})}`);
});

deviceHandler(io);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] Started at ${new Date().toISOString()}`);
  console.log(`> REST API:  http://0.0.0.0:${PORT}`);
  console.log(`> WebSocket: ws://0.0.0.0:${PORT}`);
  console.log(`> Auth:      ${isAuthEnabled() ? 'ENABLED (API_KEY set)' : 'DISABLED (open mode)'}`);
});

module.exports = { app, server, io };
