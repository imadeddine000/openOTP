/**
 * Admin API for openOTP — user management & global stats for the business owner.
 * Auth: Bearer token + role 'admin' (authAdmin middleware).
 * Mount point: /api/admin
 *
 *   GET    /api/admin/stats           — global stats across all users
 *   GET    /api/admin/analytics       — chart data (status mix, per-day traffic, top users)
 *   GET    /api/admin/users           — list all users (with per-user stats)
 *   POST   /api/admin/users           — create a user  { email, password, role? }
 *   POST   /api/admin/users/import    — bulk import   { users: [{ email, password, role }] }
 *   PATCH  /api/admin/users/:id       — update user   { email?, password?, enabled?, role? }
 *   DELETE /api/admin/users/:id       — delete user (cascades devices/messages)
 *   GET    /api/admin/devices         — list all devices (with owner email)
 *   PATCH  /api/admin/devices/:id     — update device { name?, enabled?, simRouting? }
 *   DELETE /api/admin/devices/:id     — delete device (cascades messages)
 *   GET    /api/admin/messages        — all messages  ?page=&limit=&type=&status=&userId=&deviceId=&q=
 *   DELETE /api/admin/messages/:id    — delete a message record
 *   GET    /api/admin/batches         — all batches   ?page=&limit=
 */
const express = require('express');
const router = express.Router();
const store = require('../services/store');
const { authAdmin } = require('../middleware/auth');

// Global stats across the whole SaaS.
router.get('/stats', authAdmin, (req, res) => {
  const users = store.getAllUsers();
  let devices = 0, devicesOnline = 0, sent = 0, delivered = 0, failed = 0, pending = 0, received = 0;
  for (const u of users) {
    const s = store.getStats(u.id);
    devices += s.devices; devicesOnline += s.devicesOnline;
    sent += s.sent; delivered += s.delivered; failed += s.failed; pending += s.pending;
    received += s.received;
  }
  res.json({ data: {
    users: users.length,
    clients: users.filter((u) => u.role === 'client').length,
    admins: users.filter((u) => u.role === 'admin').length,
    devices, devicesOnline, sent, delivered, failed, pending, received,
  } });
});

// List all users with their usage stats.
router.get('/users', authAdmin, (req, res) => {
  const users = store.getAllUsers().map((u) => ({ ...u, stats: store.getStats(u.id) }));
  res.json({ data: users });
});

// Create a user (admin creates a client or another admin).
router.post('/users', authAdmin, (req, res) => {
  try {
    const user = store.createUser({ email: req.body.email, password: req.body.password, role: req.body.role || 'client' });
    res.status(201).json({ data: store.publicUser(user) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Update a user (rename, reset password, enable/disable, change role).
router.patch('/users/:id', authAdmin, (req, res) => {
  try {
    const u = store.updateUser(req.params.id, req.body);
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ data: store.publicUser(u) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Delete a user (cascades to their devices + messages).
router.delete('/users/:id', authAdmin, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
  const ok = store.deleteUser(req.params.id);
  if (!ok) return res.status(404).json({ error: 'User not found' });
  res.json({ data: { success: true } });
});

/* ---- devices (global device management) ---- */

// List every device across all users (with owner email + online state).
router.get('/devices', authAdmin, (req, res) => {
  res.json({ data: store.getAllDevices() });
});

// Update a device (rename, enable/disable, SIM routing).
router.patch('/devices/:id', authAdmin, (req, res) => {
  const d = store.updateDevice(req.params.id, req.body);
  if (!d) return res.status(404).json({ error: 'Device not found' });
  res.json({ data: store.publicDevice(d) });
});

// Delete a device (cascades to its messages).
router.delete('/devices/:id', authAdmin, (req, res) => {
  const ok = store.deleteDevice(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Device not found' });
  res.json({ data: { success: true } });
});

/* ---- messages (global message log) ---- */

// List all messages with optional filters + text search.
router.get('/messages', authAdmin, (req, res) => {
  res.json(store.getAllMessages({
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 50,
    type: req.query.type || null,
    status: req.query.status || null,
    userId: req.query.userId || null,
    deviceId: req.query.deviceId || null,
    q: req.query.q || null,
  }));
});

// Delete a single message record.
router.delete('/messages/:id', authAdmin, (req, res) => {
  const ok = store.deleteMessage(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Message not found' });
  res.json({ data: { success: true } });
});

/* ---- batches (global batch log) ---- */

router.get('/batches', authAdmin, (req, res) => {
  res.json(store.getAllBatches({
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 50,
  }));
});

/* ---- bulk user import ---- */

// Import users from an uploaded CSV/JSON payload: { users: [{ email, password, role }] }.
router.post('/users/import', authAdmin, (req, res) => {
  const list = Array.isArray(req.body && req.body.users) ? req.body.users
    : (Array.isArray(req.body) ? req.body : []);
  if (!list.length) return res.status(400).json({ error: 'users array is required' });
  res.json({ data: store.importUsers(list) });
});

/* ---- analytics (dashboard charts) ---- */

// Aggregated chart data: status mix, per-day traffic (14d), top users by volume.
router.get('/analytics', authAdmin, (req, res) => {
  res.json({ data: store.getAnalytics() });
});

module.exports = router;
