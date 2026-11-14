/**
 * End-to-end integration test:
 * 1. Simulated Android device connects via Socket.io
 * 2. Device registers with server
 * 3. Server dispatches the queued OTP task to the device
 * 4. Device sends SMS and reports result back
 * 5. Verify final state: task status = "sent"
 */
const { io } = require('socket.io-client');
const http = require('http');

const SERVER = 'http://localhost:3000';

function fetchJSON(path) {
  return new Promise((resolve, reject) => {
    http.get(`${SERVER}${path}`, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}

async function runTest() {
  console.log('=== E2E Integration Test ===\n');

  // Step 0: Enqueue an OTP request via REST API
  const postData = JSON.stringify({ phone: '+1234567890', message: 'Your OTP code is: 654321' });
  const { requestId } = await new Promise((resolve, reject) => {
    const req = http.request(`${SERVER}/api/otp/request`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
  console.log(`[0] Enqueued OTP request: ${requestId}`);

  // Step 1: Check initial state
  const initialStatus = await fetchJSON('/api/otp/status');
  console.log(`[1] Initial state: ${initialStatus.queueLength} queued, ${initialStatus.connectedDevices.length} devices`);

  // Step 2: Connect as a simulated Android device
  const socket = io(SERVER, { transports: ['websocket'] });

  return new Promise((resolve) => {
    socket.on('connect', () => {
      console.log(`[2] Device connected: ${socket.id}`);

      // Step 3: Register device (using fixed event name + field names)
      socket.emit('device-register', { id: 'test-device-1', model: 'Pixel 7' });
      console.log('[3] Emitted device-register: { id: "test-device-1", model: "Pixel 7" }');
    });

    // Step 4: Listen for OTP dispatch (using fixed event name)
    socket.on('send-sms', (data) => {
      console.log(`[4] Received send-sms event:`);
      console.log(`    taskId: ${data.taskId}`);
      console.log(`    phone:  ${data.phone}`);
      console.log(`    message: ${data.message}`);

      // Verify payload has correct fields
      const hasTaskId = typeof data.taskId === 'string';
      const hasPhone = typeof data.phone === 'string';
      const hasMessage = typeof data.message === 'string';
      console.log(`    ✅ taskId present: ${hasTaskId}`);
      console.log(`    ✅ phone present: ${hasPhone}`);
      console.log(`    ✅ message present: ${hasMessage}`);

      // Step 5: Report SMS result (using fixed event name + field names)
      socket.emit('sms-result', { taskId: data.taskId, success: true });
      console.log('[5] Emitted sms-result: { taskId, success: true }');

      // Step 6: Verify final state
      setTimeout(async () => {
        const finalStatus = await fetchJSON('/api/otp/status');
        console.log(`\n[6] Final state:`);
        console.log(`    sent: ${finalStatus.sentCount}`);
        console.log(`    queued: ${finalStatus.queueLength}`);
        console.log(`    dispatched: ${finalStatus.dispatchedCount}`);
        console.log(`    devices: ${JSON.stringify(finalStatus.connectedDevices.map(d => ({ id: d.id, status: d.status })))}`);

        const requests = await fetchJSON('/api/otp/requests');
        const sentRequest = requests.requests.find(r => r.status === 'sent');
        console.log(`    sent request deviceId: ${sentRequest ? sentRequest.deviceId : 'N/A'}`);

        const passed = finalStatus.sentCount >= 1 && finalStatus.connectedDevices[0].status === 'idle';
        console.log(`\n=== RESULT: ${passed ? '✅ ALL CHECKS PASSED' : '❌ TEST FAILED'} ===`);

        socket.disconnect();
        resolve(passed);
      }, 500);
    });

    socket.on('connect_error', (err) => {
      console.log(`❌ Connection error: ${err.message}`);
      resolve(false);
    });
  });
}

runTest().then((passed) => {
  process.exit(passed ? 0 : 1);
});
