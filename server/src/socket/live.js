/**
 * Live-update bridge for the dashboard. Socket.io is used only to push a
 * lightweight "change" ping so the web UI can re-fetch fresh data.
 */
let io = null;

function setIo(ioInstance) {
  io = ioInstance;
}

function broadcast() {
  if (io) io.emit('change', { time: Date.now() });
}

module.exports = { setIo, broadcast };
