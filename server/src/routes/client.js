/**
 * Client Integration API for openOTP — a clean REST interface so third-party
 * apps can send OTP/SMS through the gateway WITHOUT knowing about devices.
 * The server auto-routes each request to an online Android gateway device.
 *
 * Auth: x-api-key header (the user's sk_... key from the dashboard).
 * Mount point: /api/v1
 *
 *   GET    /api/v1/health            — public health check
 *   GET    /api/v1/account           — account info + usage stats
 *   GET    /api/v1/devices           — list gateway devices (online status)
 *   POST   /api/v1/messages          — send one message  { to, message, deviceId?, simSubscriptionId?, simSlotIndex? }
 *   POST   /api/v1/messages/batch    — send many        { messages: [{ to, message, deviceId? }] } | { recipients: [...], message }
 *   GET    /api/v1/messages/:id      — get one message status
 *   GET    /api/v1/messages          — list messages     ?page=&limit=&status=&deviceId=&type=sent|received
 */
const express = require('express');
const router = express.Router();
const store = require('../services/store');
const { authClient } = require('../middleware/auth');
const live = require('../socket/live');

function emit() { try { live.broadcast(); } catch { /* noop */ } }

/* ---- shared helpers (mirror gateway logic so the client API is self-contained) ---- */
function spamCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
/** Append a unique random code on a new line so carriers don't flag repeated identical SMS as spam. */
function withSpamCode(message) { return message + '\n#' + spamCode(); }
/** Decide which SIM a message should use (explicit param > device routing config > phone default). */
function resolveSim(d, body) {
  if (body && body.simSubscriptionId != null) {
    return { subscriptionId: body.simSubscriptionId, slotIndex: body.simSlotIndex != null ? body.simSlotIndex : null };
  }
  const r = d.simRouting || {};
  if (r.mode === 'sim' && r.subscriptionId != null) {
    return { subscriptionId: r.subscriptionId, slotIndex: r.slotIndex != null ? r.slotIndex : null };
  }
  if (r.mode === 'roundrobin') return store.rotateSim(d.id) || { subscriptionId: null, slotIndex: null };
  return { subscriptionId: null, slotIndex: null };
}
/** Shape a message for the client response (friendly field names, hide internals). */
function publicMessage(m) {
  return {
    id: m.id, type: m.type || 'sent', to: m.recipient, sender: m.sender || null,
    message: m.message, status: m.status,
    deviceId: m.device, simSubscriptionId: m.simSubscriptionId, simSlotIndex: m.simSlotIndex,
    createdAt: m.createdAt, sentAt: m.sentAt, deliveredAt: m.deliveredAt, failedAt: m.failedAt,
    receivedAt: m.receivedAt || null,
    errorCode: m.errorCode, errorMessage: m.errorMessage,
  };
}

/* ---- routes ---- */
router.get('/health', (req, res) => {
  res.json({ data: { status: 'ok', service: 'openOTP', version: '1.0', time: new Date().toISOString() } });
});

router.get('/account', authClient, (req, res) => {
  const stats = store.getStats(req.user.id);
  res.json({ data: {
    email: req.user.email, apiKey: req.user.apiKey,
    devices: stats.devices, devicesOnline: stats.devicesOnline,
    messagesSent: stats.sent, messagesDelivered: stats.delivered,
    messagesFailed: stats.failed, messagesPending: stats.pending,
  } });
});

router.get('/devices', authClient, (req, res) => {
  res.json({ data: store.getDevicesByUser(req.user.id).map(store.publicDevice) });
});

// Send a single message. Auto-routes to an online device if deviceId is omitted.
router.post('/messages', authClient, (req, res) => {
  const to = req.body.to || (Array.isArray(req.body.recipients) ? req.body.recipients[0] : null);
  const message = req.body.message || '';
  if (!to || !message) return res.status(400).json({ error: 'to and message are required' });

  let device = null;
  if (req.body.deviceId) {
    device = store.getDevice(req.body.deviceId);
    if (!device || device.user !== req.user.id) return res.status(404).json({ error: 'Device not found' });
  } else {
    device = store.pickDeviceForUser(req.user.id);
  }
  if (!device) return res.status(503).json({ error: 'No online device available. Connect an Android gateway device first.' });
  if (!device.enabled) return res.status(503).json({ error: 'Selected device is not enabled' });

  const sim = resolveSim(device, req.body);
  const batch = store.createBatch(req.user.id, device.id, message, 1);
  const msg = store.createMessage(req.user.id, device.id, batch.id, to, withSpamCode(message), sim.subscriptionId, sim.slotIndex);
  emit();
  res.status(201).json({ data: { id: msg.id, status: msg.status, deviceId: device.id, to, message } });
});

// Batch send. Accepts { messages: [{ to, message, deviceId? }] } or { recipients: [...], message }.
router.post('/messages/batch', authClient, (req, res) => {
  let entries = [];
  if (Array.isArray(req.body.messages)) {
    entries = req.body.messages;
  } else if (Array.isArray(req.body.recipients) && req.body.message) {
    entries = req.body.recipients.map((to) => ({ to, message: req.body.message }));
  }
  if (!entries.length) return res.status(400).json({ error: 'messages array or recipients+message required' });

  const defaultDevice = store.pickDeviceForUser(req.user.id);
  if (!defaultDevice && !entries.some((e) => e.deviceId)) {
    return res.status(503).json({ error: 'No online device available' });
  }

  const results = [];
  for (const e of entries) {
    const to = e.to;
    const message = e.message || '';
    if (!to || !message) { results.push({ to, error: 'to and message are required' }); continue; }

    let device = null;
    if (e.deviceId) {
      device = store.getDevice(e.deviceId);
      if (!device || device.user !== req.user.id) { results.push({ to, error: 'Device not found' }); continue; }
    } else {
      device = defaultDevice;
    }
    if (!device || !device.enabled) { results.push({ to, error: 'No available device' }); continue; }

    const sim = resolveSim(device, e);
    const batch = store.createBatch(req.user.id, device.id, message, 1);
    const msg = store.createMessage(req.user.id, device.id, batch.id, to, withSpamCode(message), sim.subscriptionId, sim.slotIndex);
    results.push({ id: msg.id, to, status: msg.status, deviceId: device.id });
  }
  emit();
  res.status(201).json({ data: { count: results.filter((r) => r.id).length, messages: results } });
});

// Get a single message by id (status / delivery info).
router.get('/messages/:id', authClient, (req, res) => {
  const m = store.getMessage(req.params.id);
  if (!m || m.user !== req.user.id) return res.status(404).json({ error: 'Message not found' });
  res.json({ data: publicMessage(m) });
});

// List messages (paginated, filterable by status and deviceId).
router.get('/messages', authClient, (req, res) => {
  const result = store.getMessagesByUser(req.user.id, {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 50,
    status: req.query.status || null,
    deviceId: req.query.deviceId || null,
    type: req.query.type || 'sent',
  });
  res.json({ data: result.data.map(publicMessage), total: result.total, page: result.page, limit: result.limit });
});

module.exports = router;
