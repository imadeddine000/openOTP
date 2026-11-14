/**
 * Gateway REST API for openOTP — mirrors textbee's /gateway contract.
 * Auth: x-api-key header (devices) or Bearer token (dashboard).
 */
const express = require('express');
const router = express.Router();
const store = require('../services/store');
const { authGateway, authUser } = require('../middleware/auth');
const live = require('../socket/live');

function emit() { try { live.broadcast(); } catch { /* noop */ } }
function ownedDevice(req, res) {
  const d = store.getDevice(req.params.id);
  if (!d || d.user !== req.user.id) { res.status(404).json({ error: 'Device not found' }); return null; }
  return d;
}
function claimedPayload(m) {
  return {
    smsId: m.id, smsBatchId: m.smsBatchId, recipient: m.recipient, message: m.message,
    simSubscriptionId: m.simSubscriptionId, simSlotIndex: m.simSlotIndex,
  };
}
function spamCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
/** Append a unique random code on a new line so carriers don't flag repeated identical SMS as spam. */
function withSpamCode(message) { return message + '\n#' + spamCode(); }
/**
 * Decide which SIM a message should use:
 *  1. explicit simSubscriptionId/simSlotIndex in the request (UI per-send choice or API param)
 *  2. device's saved routing config: 'sim' = always a specific SIM, 'roundrobin' = alternate across all SIMs
 *  3. 'any'/unset = let the phone pick its default SIM
 */
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

router.get('/stats', authUser, (req, res) => { res.json({ data: store.getStats(req.user.id) }); });

router.get('/devices', authUser, (req, res) => {
  res.json({ data: store.getDevicesByUser(req.user.id).map(store.publicDevice) });
});

router.post('/devices', authGateway, (req, res) => {
  const device = store.createDevice(req.user.id, req.body);
  emit();
  res.status(201).json({ data: store.publicDevice(device) });
});

router.patch('/devices/:id', authGateway, (req, res) => {
  const d = ownedDevice(req, res); if (!d) return;
  const updated = store.updateDevice(req.params.id, req.body);
  emit();
  res.json({ data: store.publicDevice(updated) });
});

router.delete('/devices/:id', authUser, (req, res) => {
  const d = ownedDevice(req, res); if (!d) return;
  store.deleteDevice(req.params.id);
  emit();
  res.json({ data: { success: true } });
});

router.post('/devices/:id/send-sms', authGateway, (req, res) => {
  const d = ownedDevice(req, res); if (!d) return;
  if (!d.enabled) return res.status(400).json({ error: 'Device is not enabled' });
  const recipients = Array.isArray(req.body.recipients) ? req.body.recipients : [];
  const message = req.body.message || '';
  if (!recipients.length || !message) return res.status(400).json({ error: 'recipients and message are required' });
  const sim = resolveSim(d, req.body);
  const batch = store.createBatch(req.user.id, d.id, message, recipients.length);
  const messages = recipients.map((r) =>
    store.createMessage(req.user.id, d.id, batch.id, r, withSpamCode(message), sim.subscriptionId, sim.slotIndex));
  emit();
  res.json({ data: { success: true, count: messages.length, smsBatchId: batch.id,
    messages: messages.map((m) => ({ smsId: m.id, recipient: m.recipient, status: m.status })) } });
});

router.post('/devices/:id/send-bulk-sms', authGateway, (req, res) => {
  const d = ownedDevice(req, res); if (!d) return;
  if (!d.enabled) return res.status(400).json({ error: 'Device is not enabled' });
  const entries = Array.isArray(req.body.messages) ? req.body.messages : [];
  if (!entries.length) return res.status(400).json({ error: 'messages array is required' });
  let total = 0; const batchIds = [];
  for (const e of entries) {
    const recipients = Array.isArray(e.recipients) ? e.recipients : [];
    const message = e.message || '';
    if (!recipients.length || !message) continue;
    const sim = resolveSim(d, e);
    const batch = store.createBatch(req.user.id, d.id, message, recipients.length);
    batchIds.push(batch.id);
    for (const r of recipients) store.createMessage(req.user.id, d.id, batch.id, r, withSpamCode(message), sim.subscriptionId, sim.slotIndex);
    total += recipients.length;
  }
  emit();
  res.json({ data: { success: true, count: total, smsBatchIds: batchIds } });
});

router.post('/devices/:id/receive-sms', authGateway, (req, res) => {
  const d = ownedDevice(req, res); if (!d) return;
  const msg = store.receiveSms(req.user.id, d.id, req.body);
  emit();
  res.json({ data: { success: true, smsId: msg.id } });
});

router.patch('/devices/:id/sms-status', authGateway, (req, res) => {
  const d = ownedDevice(req, res); if (!d) return;
  const msg = store.updateMessageStatus(d.id, req.body);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  emit();
  res.json({ data: { success: true, smsId: msg.id, status: msg.status } });
});

router.post('/devices/:id/heartbeat', authGateway, (req, res) => {
  const d = ownedDevice(req, res); if (!d) return;
  store.touchDevice(d.id);
  if (req.body && req.body.simInfo) store.updateDevice(d.id, { simInfo: req.body.simInfo });
  emit();
  res.json({ data: { ok: true, serverTime: Date.now() } });
});

router.get('/devices/:id/messages/pending', authGateway, (req, res) => {
  const d = ownedDevice(req, res); if (!d) return;
  const limit = Math.min(parseInt(req.query.limit) || 25, 25);
  res.json({ data: store.getPendingMessages(d.id, limit).map(claimedPayload) });
});

router.post('/devices/:id/messages/claim', authGateway, (req, res) => {
  const d = ownedDevice(req, res); if (!d) return;
  const limit = Math.min(parseInt(req.body && req.body.limit) || 25, 25);
  const msgs = store.claimMessages(d.id, limit);
  res.json({ data: msgs.map(claimedPayload), more: false, retryAfterSeconds: 15 });
});

router.get('/devices/:id/sms', authUser, (req, res) => {
  const d = ownedDevice(req, res); if (!d) return;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  res.json(store.getMessagesByDevice(d.id, { page, limit }));
});

router.get('/devices/:id/sms/:smsId', authUser, (req, res) => {
  const m = store.getMessage(req.params.smsId);
  if (!m || m.device !== req.params.id || m.user !== req.user.id) return res.status(404).json({ error: 'Message not found' });
  res.json({ data: m });
});

router.get('/devices/:id/sms-batch/:batchId', authUser, (req, res) => {
  const b = store.getBatchWithMessages(req.params.batchId);
  if (!b || b.device !== req.params.id || b.user !== req.user.id) return res.status(404).json({ error: 'Batch not found' });
  res.json({ data: b });
});

module.exports = router;
