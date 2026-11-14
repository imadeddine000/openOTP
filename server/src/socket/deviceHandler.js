const queue = require('../services/queue');
const { socketAuth, isAuthEnabled } = require('../middleware/auth');

/**
 * Set up Socket.io event handlers for Android device connections.
 * The queue module is initialised with the io instance so it can
 * emit `send-sms` events to individual device sockets.
 *
 * Heartbeat flow:
 *   device → server:  `heartbeat`           (every 15s)
 *   server → device:  `heartbeat-ack`       (immediate response)
 *
 * Configurable heartbeat:
 *   server → device:  `heartbeat-config`    ({ interval: ms })
 *
 * Auth: if API_KEY env var is set, sockets must pass { auth: { key } }.
 */
function deviceHandler(io) {
  // Apply socket-level auth middleware
  io.use(socketAuth);

  queue.init(io);

  io.on('connection', (socket) => {
    console.log(`[SOCKET] Connection opened: ${socket.id}${isAuthEnabled() ? ' (auth ✓)' : ' (open)'}`);

    // Android device registers itself after connecting
    socket.on('device-register', (deviceInfo) => {
      queue.registerDevice(socket.id, deviceInfo);
      // Send current heartbeat interval so device syncs immediately
      socket.emit('heartbeat-config', { interval: queue.HEARTBEAT_INTERVAL_MS });
    });

    // Device sends a periodic heartbeat to prove it's alive
    socket.on('heartbeat', () => {
      queue.heartbeat(socket.id);
      // Acknowledge so the device knows the server is alive too
      socket.emit('heartbeat-ack', { timestamp: new Date().toISOString() });
    });

    // Device reports the outcome of an SMS send attempt
    socket.on('sms-result', ({ taskId, success, error }) => {
      queue.markResult(socket.id, taskId, success, error);
    });

    // Admin/UI can request a heartbeat interval change for all or one device
    socket.on('set-heartbeat-interval', ({ interval, target }) => {
      // target: '*' for all, or a socketId for one device
      queue.pushHeartbeatConfig(target || '*', interval);
    });

    socket.on('disconnect', () => {
      console.log(`[SOCKET] Connection closed: ${socket.id}`);
      queue.removeDevice(socket.id);
    });
  });
}

module.exports = deviceHandler;