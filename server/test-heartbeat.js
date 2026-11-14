/**
 * Heartbeat integration test.
 * Verifies: device-register → heartbeat → heartbeat-ack → stats with lastHeartbeat + isOnline
 */
const { io } = require('socket.io-client');
const http = require('http');

const socket = io('http://localhost:3000');
let heartbeatAckReceived = false;
let statsChecked = false;

socket.on('connect', () => {
  console.log('[TEST] Connected');
  socket.emit('device-register', { id: 'hb-test-device', model: 'TestPhone' });
});

socket.on('heartbeat-ack', (data) => {
  console.log('[TEST] Received heartbeat-ack:', JSON.stringify(data));
  heartbeatAckReceived = true;
  // Now check stats via REST
  http.get('http://localhost:3000/api/otp/status', (res) => {
    let body = '';
    res.on('data', (d) => (body += d));
    res.on('end', () => {
      if (statsChecked) return;
      statsChecked = true;
      const stats = JSON.parse(body);
      const dev = stats.connectedDevices.find((d) => d.id === 'hb-test-device');
      console.log('[TEST] Device in stats:', JSON.stringify(dev));
      console.log('[TEST] has lastHeartbeat:', !!dev && !!dev.lastHeartbeat);
      console.log('[TEST] isOnline:', !!dev && dev.isOnline);
      const pass = heartbeatAckReceived && dev && dev.lastHeartbeat && dev.isOnline;
      console.log(pass ? '\n=== HEARTBEAT TEST PASSED ===' : '\n=== HEARTBEAT TEST FAILED ===');
      socket.disconnect();
      process.exit(pass ? 0 : 1);
    });
  });
});

socket.on('stats', (s) => {
  // Trigger heartbeat after registration is reflected in stats
  if (s.connectedDevices && s.connectedDevices.find((d) => d.id === 'hb-test-device')) {
    socket.emit('heartbeat');
  }
});

setTimeout(() => {
  console.log('TIMEOUT — test did not complete in 10s');
  process.exit(1);
}, 10000);
