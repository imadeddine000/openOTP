const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const live = require('./socket/live');

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
});
live.setIo(io);

server.listen(PORT, '0.0.0.0', () => {
  console.log('[openOTP] SMS Gateway SaaS running on http://0.0.0.0:' + PORT);
  console.log('> Auth:     /api/auth/register, /api/auth/login');
  console.log('> Client:   /api/v1/* (x-api-key)');
  console.log('> Admin:    /api/admin/* (Bearer + admin role)');
  console.log('> Gateway:  /gateway/*');
  console.log('> Dashboard: http://localhost:' + PORT);
});

module.exports = { app, server, io };
