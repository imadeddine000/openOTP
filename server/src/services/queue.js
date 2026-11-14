const { v4: uuidv4 } = require('uuid');

let io = null;

// Heartbeat configuration
const HEARTBEAT_INTERVAL_MS = 15000;   // devices send heartbeat every 15s
const HEARTBEAT_TIMEOUT_MS = 45000;     // device considered offline after 45s of silence
const STALE_CHECK_INTERVAL_MS = 10000;  // server checks for stale devices every 10s

// Retry & timeout configuration
const MAX_RETRIES = 3;                  // max retry attempts for a failed SMS task
const DISPATCH_TIMEOUT_MS = 60000;      // requeue task if no result after 60s in "dispatched"
const TIMEOUT_CHECK_INTERVAL_MS = 15000; // check for timed-out tasks every 15s

// In-memory state
const otpQueue = []; // [{ id, phone, message, status, createdAt, deviceId?, dispatchedAt?, completedAt?, error?, retryCount? }]
const connectedDevices = new Map(); // socketId -> { id, model, status, lastSeen, lastHeartbeat, currentTaskId }

let staleCheckTimer = null;
let timeoutCheckTimer = null;

/**
 * Wire the Socket.io instance so the queue can emit events to devices.
 * Also starts the periodic stale-device checker.
 */
function init(socketIo) {
  io = socketIo;
  startStaleChecker();
  startTimeoutChecker();
}

/**
 * Periodically check for tasks that have been in "dispatched" state longer
 * than DISPATCH_TIMEOUT_MS without a result. Requeue them so another device
 * can pick them up (the original device may have gone silent).
 */
function startTimeoutChecker() {
  if (timeoutCheckTimer) clearInterval(timeoutCheckTimer);
  timeoutCheckTimer = setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const task of otpQueue) {
      if (task.status === 'dispatched' && task.dispatchedAt) {
        const elapsed = now - new Date(task.dispatchedAt).getTime();
        if (elapsed > DISPATCH_TIMEOUT_MS) {
          // Find the device that had this task and free it
          for (const [socketId, device] of connectedDevices.entries()) {
            if (device.currentTaskId === task.id) {
              device.status = 'idle';
              device.currentTaskId = null;
              break;
            }
          }
          task.status = 'queued';
          task.deviceId = null;
          task.dispatchedAt = null;
          changed = true;
          console.log(`[QUEUE] Task ${task.id} timed out after ${Math.round(elapsed / 1000)}s — requeued`);
        }
      }
    }
    if (changed) {
      notifyStats();
      tryDispatch();
    }
  }, TIMEOUT_CHECK_INTERVAL_MS);
}

/**
 * Periodically check for devices that haven't sent a heartbeat within
 * HEARTBEAT_TIMEOUT_MS. Mark them as "offline" and notify the UI.
 */
function startStaleChecker() {
  if (staleCheckTimer) clearInterval(staleCheckTimer);
  staleCheckTimer = setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [socketId, device] of connectedDevices.entries()) {
      const lastHb = device.lastHeartbeat ? new Date(device.lastHeartbeat).getTime() : 0;
      const elapsed = now - lastHb;
      if (elapsed > HEARTBEAT_TIMEOUT_MS && device.status !== 'offline') {
        // Device hasn't heartbeat'd recently — mark offline (but keep in map
        // so we can recover if it comes back; socket disconnect handles removal)
        device.status = 'offline';
        changed = true;
        console.log(`[QUEUE] Device ${device.id} marked offline (no heartbeat for ${Math.round(elapsed / 1000)}s)`);
      }
    }
    if (changed) notifyStats();
  }, STALE_CHECK_INTERVAL_MS);
}

/**
 * Add an OTP request to the queue and attempt immediate dispatch.
 */
function enqueue({ phone, message }) {
  const request = {
    id: uuidv4(),
    phone,
    message,
    status: 'queued',
    createdAt: new Date().toISOString(),
    deviceId: null,
    retryCount: 0,
  };
  otpQueue.push(request);
  tryDispatch();
  return request;
}

/**
 * Register a newly connected device as idle.
 */
function registerDevice(socketId, deviceInfo) {
  const now = new Date().toISOString();
  connectedDevices.set(socketId, {
    id: (deviceInfo && deviceInfo.id) || socketId,
    model: (deviceInfo && deviceInfo.model) || 'unknown',
    status: 'idle',
    lastSeen: now,
    lastHeartbeat: now,
    currentTaskId: null,
  });
  console.log(`[QUEUE] Device registered: ${connectedDevices.get(socketId).id}`);
  notifyStats();
  tryDispatch();
}

/**
 * Update the heartbeat timestamp for a device.
 * If the device was marked offline, restore it to idle.
 */
function heartbeat(socketId) {
  const device = connectedDevices.get(socketId);
  if (device) {
    const wasOffline = device.status === 'offline';
    device.lastHeartbeat = new Date().toISOString();
    device.lastSeen = device.lastHeartbeat;
    if (wasOffline) {
      device.status = 'idle';
      console.log(`[QUEUE] Device ${device.id} back online (heartbeat received)`);
      notifyStats();
      tryDispatch();
    }
  }
}

/**
 * Remove a disconnected device. If it had an in-flight task, requeue it.
 */
function removeDevice(socketId) {
  const device = connectedDevices.get(socketId);
  if (device) {
    if (device.currentTaskId) {
      const task = otpQueue.find((t) => t.id === device.currentTaskId);
      if (task && task.status === 'dispatched') {
        task.status = 'queued';
        task.deviceId = null;
        console.log(`[QUEUE] Requeued task ${task.id} (device ${device.id} disconnected)`);
      }
    }
    console.log(`[QUEUE] Device removed: ${device.id}`);
    connectedDevices.delete(socketId);
  }
  notifyStats();
  tryDispatch();
}

/**
 * Record the result of an SMS send attempt from a device.
 */
function markResult(socketId, taskId, success, error) {
  const task = otpQueue.find((t) => t.id === taskId);
  if (task) {
    if (success) {
      task.status = 'sent';
      task.error = null;
      task.completedAt = new Date().toISOString();
      console.log(`[QUEUE] Task ${taskId} sent`);
    } else {
      // Retry logic: requeue up to MAX_RETRIES times before permanent failure
      task.retryCount = (task.retryCount || 0) + 1;
      if (task.retryCount <= MAX_RETRIES) {
        task.status = 'queued';
        task.deviceId = null;
        task.dispatchedAt = null;
        task.error = error || null;
        console.log(`[QUEUE] Task ${taskId} failed (attempt ${task.retryCount}/${MAX_RETRIES}) — requeued for retry`);
      } else {
        task.status = 'failed';
        task.error = error || `Failed after ${MAX_RETRIES} retries`;
        task.completedAt = new Date().toISOString();
        console.log(`[QUEUE] Task ${taskId} permanently failed after ${MAX_RETRIES} retries`);
      }
    }
  }
  const device = connectedDevices.get(socketId);
  if (device) {
    device.status = 'idle';
    device.currentTaskId = null;
    device.lastSeen = new Date().toISOString();
  }
  notifyStats();
  tryDispatch();
}

/**
 * Find an idle device and a queued task, then dispatch.
 */
function tryDispatch() {
  if (!io) return;

  const pendingTask = otpQueue.find((t) => t.status === 'queued');
  if (!pendingTask) return;

  const idleEntry = [...connectedDevices.entries()].find(
    ([_, d]) => d.status === 'idle'
  );
  if (!idleEntry) return;

  const [socketId, device] = idleEntry;

  pendingTask.status = 'dispatched';
  pendingTask.deviceId = device.id;
  pendingTask.dispatchedAt = new Date().toISOString();
  device.status = 'busy';
  device.currentTaskId = pendingTask.id;

  io.to(socketId).emit('send-sms', {
    taskId: pendingTask.id,
    phone: pendingTask.phone,
    message: pendingTask.message,
  });

  console.log(`[QUEUE] Dispatched task ${pendingTask.id} to device ${device.id}`);
  notifyStats();
}

/**
 * Return a snapshot of current state for the UI / status endpoint.
 */
function getStats() {
  return {
    queueLength: otpQueue.filter((t) => t.status === 'queued').length,
    dispatchedCount: otpQueue.filter((t) => t.status === 'dispatched').length,
    sentCount: otpQueue.filter((t) => t.status === 'sent').length,
    failedCount: otpQueue.filter((t) => t.status === 'failed').length,
    totalRequests: otpQueue.length,
    connectedDevices: [...connectedDevices.values()].map((d) => ({
      id: d.id,
      model: d.model,
      status: d.status,
      lastSeen: d.lastSeen,
      lastHeartbeat: d.lastHeartbeat || null,
      isOnline: d.status !== 'offline',
    })),
    recentRequests: otpQueue.slice(-20).reverse(),
  };
}

/**
 * Broadcast stats to all connected UI clients.
 */
function notifyStats() {
  if (io) {
    io.emit('stats', getStats());
  }
}

/**
 * Return all OTP requests (newest first) for the REST API.
 */
function getRequests() {
  return otpQueue.slice().reverse();
}

/**
 * Push a new heartbeat interval to a specific device (or all devices).
 * The device adjusts its heartbeat timer accordingly.
 */
function pushHeartbeatConfig(socketId, intervalMs) {
  if (!io) return;
  const validInterval = Math.max(5000, Math.min(intervalMs || HEARTBEAT_INTERVAL_MS, 120000));
  if (socketId === '*') {
    io.emit('heartbeat-config', { interval: validInterval });
    console.log(`[QUEUE] Pushed heartbeat config to all devices: ${validInterval}ms`);
  } else {
    io.to(socketId).emit('heartbeat-config', { interval: validInterval });
    const device = connectedDevices.get(socketId);
    if (device) {
      console.log(`[QUEUE] Pushed heartbeat config to device ${device.id}: ${validInterval}ms`);
    }
  }
}

module.exports = {
  init,
  enqueue,
  registerDevice,
  removeDevice,
  markResult,
  heartbeat,
  getStats,
  getRequests,
  pushHeartbeatConfig,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  MAX_RETRIES,
  DISPATCH_TIMEOUT_MS,
};