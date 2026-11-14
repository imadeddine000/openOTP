/**
 * JSON-file-backed data store for the openOTP SMS gateway SaaS.
 * Mirrors textbee's data model: users, devices, sms messages, sms batches.
 * No external deps — uses Node crypto for hashing and uuid for ids.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const state = { users: {}, devices: {}, messages: {}, batches: {} };

function load() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      Object.assign(state, raw);
    }
  } catch (e) {
    console.error('[store] load failed:', e.message);
  }
}

let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DB_FILE, JSON.stringify(state), 'utf8');
    } catch (e) {
      console.error('[store] save failed:', e.message);
    }
  }, 250);
}

load();
ensureAdminBootstrap();

// ---------------- crypto helpers ----------------
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), s, 64).toString('hex');
  return { salt: s, hash };
}
function verifyPassword(password, salt, hash) {
  try {
    const computed = hashPassword(password, salt).hash;
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}
function newApiKey() {
  return 'sk_' + crypto.randomBytes(24).toString('hex');
}
function newId() {
  return uuidv4();
}

// ---------------- users ----------------
/** If no admin exists, promote the earliest user so the business owner keeps access. */
function ensureAdminBootstrap() {
  const users = Object.values(state.users).sort((a, b) => a.createdAt - b.createdAt);
  if (!users.some((u) => u.role === 'admin') && users.length) { users[0].role = 'admin'; save(); }
}
function createUser({ email, password, role }) {
  const lower = String(email || '').trim().toLowerCase();
  if (!lower || !password) throw new Error('Email and password are required');
  if (Object.values(state.users).some((u) => u.email === lower)) throw new Error('Email is already registered');
  const { salt, hash } = hashPassword(password);
  const id = newId();
  const user = {
    id, email: lower, salt, hash,
    role: role || (Object.values(state.users).some((u) => u.role === 'admin') ? 'client' : 'admin'),
    apiKey: newApiKey(),           // legacy primary key (devices/gateway)
    apiKeys: [],                   // client-managed keys for /api/v1
    enabled: true,
    createdAt: Date.now(),
  };
  state.users[id] = user;
  save();
  return user;
}
function findUserByEmail(email) {
  const lower = String(email || '').trim().toLowerCase();
  return Object.values(state.users).find((u) => u.email === lower) || null;
}
function findUserByApiKey(key) {
  return Object.values(state.users).find((u) =>
    u.apiKey === key || (Array.isArray(u.apiKeys) && u.apiKeys.some((k) => k.key === key))) || null;
}
function findUserById(id) { return state.users[id] || null; }
function rotateApiKey(id) {
  const u = state.users[id]; if (!u) return null;
  u.apiKey = newApiKey(); save(); return u;
}
/* ---- client API keys (multiple per user) ---- */
function listApiKeys(userId) {
  const u = state.users[userId];
  return (u && Array.isArray(u.apiKeys)) ? u.apiKeys.map((k) => ({ ...k })) : [];
}
function createApiKey(userId, label) {
  const u = state.users[userId]; if (!u) return null;
  if (!Array.isArray(u.apiKeys)) u.apiKeys = [];
  const entry = { id: newId(), key: newApiKey(), label: label || 'Default', createdAt: Date.now(), lastUsedAt: null };
  u.apiKeys.push(entry); save(); return entry;
}
function revokeApiKey(userId, keyId) {
  const u = state.users[userId]; if (!u || !Array.isArray(u.apiKeys)) return false;
  const before = u.apiKeys.length;
  u.apiKeys = u.apiKeys.filter((k) => k.id !== keyId);
  if (u.apiKeys.length !== before) { save(); return true; } return false;
}
/* ---- user management (admin) ---- */
function getAllUsers() { return Object.values(state.users).map(publicUser); }
function updateUser(id, patch = {}) {
  const u = state.users[id]; if (!u) return null;
  if (patch.email != null) {
    const lower = String(patch.email).trim().toLowerCase();
    if (!lower) throw new Error('Email cannot be empty');
    if (Object.values(state.users).some((x) => x.id !== id && x.email === lower)) throw new Error('Email is already registered');
    u.email = lower;
  }
  if (patch.password) {
    const { salt, hash } = hashPassword(patch.password);
    u.salt = salt; u.hash = hash;
  }
  for (const k of ['role', 'enabled']) if (k in patch) u[k] = patch[k];
  save(); return u;
}
function deleteUser(id) {
  if (!state.users[id]) return false;
  delete state.users[id];
  for (const d of Object.values(state.devices)) if (d.user === id) delete state.devices[d.id];
  for (const m of Object.values(state.messages)) if (m.user === id) delete state.messages[m.id];
  for (const b of Object.values(state.batches)) if (b.user === id) delete state.batches[b.id];
  save(); return true;
}
function publicUser(u) {
  return {
    id: u.id, email: u.email, role: u.role || 'client', enabled: u.enabled !== false,
    apiKey: u.apiKey, apiKeys: (u.apiKeys || []).map((k) => ({ ...k })), createdAt: u.createdAt,
  };
}

// ---------------- devices ----------------
const DEVICE_ONLINE_WINDOW_MS = 60_000;

function isDeviceOnline(d, now = Date.now()) {
  return now - (d.lastSeenAt || 0) < DEVICE_ONLINE_WINDOW_MS;
}

function createDevice(userId, input = {}) {
  const id = newId();
  const device = {
    id, user: userId,
    name: input.name || null,
    brand: input.brand || null,
    manufacturer: input.manufacturer || null,
    model: input.model || null,
    os: input.os || null,
    osVersion: input.osVersion || null,
    osApiLevel: input.osApiLevel || null,
    appVersionName: input.appVersionName || null,
    enabled: input.enabled !== false,
    lastSeenAt: Date.now(),
    sentSMSCount: 0,
    receivedSMSCount: 0,
    simInfo: input.simInfo || null,
    createdAt: Date.now(),
  };
  state.devices[id] = device;
  save();
  return device;
}
function getDevice(id) { return state.devices[id] || null; }
function getDevicesByUser(userId) { return Object.values(state.devices).filter((d) => d.user === userId); }
function updateDevice(id, patch = {}) {
  const d = state.devices[id];
  if (!d) return null;
  const allowed = ['name','brand','manufacturer','model','os','osVersion','osApiLevel','appVersionName','enabled','simInfo','simRouting'];
  for (const k of allowed) if (k in patch) d[k] = patch[k];
  d.lastSeenAt = Date.now();
  save();
  return d;
}
function deleteDevice(id) {
  const existed = !!state.devices[id];
  delete state.devices[id];
  for (const m of Object.values(state.messages)) if (m.device === id) delete state.messages[m.id];
  for (const b of Object.values(state.batches)) if (b.device === id) delete state.batches[b.id];
  save();
  return existed;
}
function touchDevice(id) {
  const d = state.devices[id];
  if (d) { d.lastSeenAt = Date.now(); save(); }
}
function rotateSim(deviceId) {
  const d = state.devices[deviceId];
  if (!d) return null;
  const sims = (d.simInfo && Array.isArray(d.simInfo.sims)) ? d.simInfo.sims.filter((s) => s && s.subscriptionId != null) : [];
  if (!sims.length) return null;
  const i = (d.simRotationIndex || 0) % sims.length;
  d.simRotationIndex = i + 1;
  save();
  return { subscriptionId: sims[i].subscriptionId, slotIndex: sims[i].slotIndex != null ? sims[i].slotIndex : null };
}
function publicDevice(d) {
  return {
    id: d.id, name: d.name, brand: d.brand, manufacturer: d.manufacturer, model: d.model,
    os: d.os, osVersion: d.osVersion, osApiLevel: d.osApiLevel, appVersionName: d.appVersionName,
    enabled: d.enabled, lastSeenAt: d.lastSeenAt, sentSMSCount: d.sentSMSCount || 0,
    receivedSMSCount: d.receivedSMSCount || 0, online: isDeviceOnline(d), createdAt: d.createdAt,
    simInfo: d.simInfo || null, simRouting: d.simRouting || null,
  };
}

// ---------------- messages + batches ----------------
function createBatch(userId, deviceId, message, recipientCount) {
  const id = newId();
  const batch = { id, user: userId, device: deviceId, message, recipientCount, status: 'pending', createdAt: Date.now() };
  state.batches[id] = batch;
  save();
  return batch;
}
function createMessage(userId, deviceId, batchId, recipient, message, simSubscriptionId, simSlotIndex) {
  const id = newId();
  const msg = {
    id, user: userId, device: deviceId, smsBatchId: batchId,
    type: 'sent', recipient, message,
    simSubscriptionId: simSubscriptionId != null ? simSubscriptionId : null,
    simSlotIndex: simSlotIndex != null ? simSlotIndex : null,
    status: 'pending', claimedAt: null,
    sentAt: null, deliveredAt: null, failedAt: null,
    errorCode: null, errorMessage: null,
    createdAt: Date.now(),
  };
  state.messages[id] = msg;
  save();
  return msg;
}
function getMessage(id) { return state.messages[id] || null; }
function getMessagesByDevice(deviceId, opts = {}) {
  let list = Object.values(state.messages).filter((m) => m.device === deviceId);
  if (opts.type) list = list.filter((m) => m.type === opts.type);
  list.sort((a, b) => b.createdAt - a.createdAt);
  const page = opts.page || 1;
  const limit = Math.min(opts.limit || 50, 100);
  const start = (page - 1) * limit;
  return { data: list.slice(start, start + limit), total: list.length, page, limit };
}
function getPendingMessages(deviceId, limit = 25) {
  return Object.values(state.messages)
    .filter((m) => m.device === deviceId && m.type === 'sent' && m.status === 'pending')
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, limit);
}
function claimMessages(deviceId, limit = 25) {
  const msgs = getPendingMessages(deviceId, limit);
  const now = Date.now();
  for (const m of msgs) { m.status = 'dispatched'; m.claimedAt = now; }
  save();
  return msgs;
}
function updateMessageStatus(deviceId, dto = {}) {
  const m = state.messages[dto.smsId];
  if (!m || m.device !== deviceId) return null;
  if (dto.status) m.status = dto.status;
  if (dto.sentAtInMillis) m.sentAt = dto.sentAtInMillis;
  if (dto.deliveredAtInMillis) m.deliveredAt = dto.deliveredAtInMillis;
  if (dto.failedAtInMillis) m.failedAt = dto.failedAtInMillis;
  if (dto.errorCode != null) m.errorCode = dto.errorCode;
  if (dto.errorMessage != null) m.errorMessage = dto.errorMessage;
  if (m.status === 'delivered' || m.status === 'sent') {
    const d = state.devices[deviceId];
    if (d && !m._counted) { d.sentSMSCount = (d.sentSMSCount || 0) + 1; m._counted = true; }
  }
  refreshBatchStatus(m.smsBatchId);
  save();
  return m;
}
function receiveSms(userId, deviceId, dto = {}) {
  if (dto.fingerprint) {
    const dup = Object.values(state.messages).find(
      (m) => m.device === deviceId && m.type === 'received' && m.fingerprint === dto.fingerprint
    );
    if (dup) return dup;
  }
  const id = newId();
  const msg = {
    id, user: userId, device: deviceId, smsBatchId: null,
    type: 'received', sender: dto.sender, recipient: null, message: dto.message,
    status: 'received', receivedAt: dto.receivedAtInMillis || Date.now(),
    fingerprint: dto.fingerprint || null,
    sentAt: null, deliveredAt: null, failedAt: null, errorCode: null, errorMessage: null,
    createdAt: Date.now(),
  };
  state.messages[id] = msg;
  const d = state.devices[deviceId];
  if (d) d.receivedSMSCount = (d.receivedSMSCount || 0) + 1;
  save();
  return msg;
}
function refreshBatchStatus(batchId) {
  const b = state.batches[batchId];
  if (!b) return;
  const msgs = Object.values(state.messages).filter((m) => m.smsBatchId === batchId);
  if (!msgs.length) return;
  if (msgs.every((m) => m.status === 'delivered')) b.status = 'delivered';
  else if (msgs.every((m) => m.status === 'sent' || m.status === 'delivered')) b.status = 'sent';
  else if (msgs.some((m) => m.status === 'failed')) b.status = 'partial';
  else b.status = 'pending';
}
function getBatch(id) { return state.batches[id] || null; }
function getBatchWithMessages(id) {
  const b = state.batches[id];
  if (!b) return null;
  const messages = Object.values(state.messages).filter((m) => m.smsBatchId === id);
  return { ...b, messages };
}

// ---------------- client API helpers ----------------
/** Online + enabled devices for a user (candidates for auto-routing). */
function getOnlineDevicesByUser(userId) {
  return getDevicesByUser(userId).filter((d) => d.enabled && isDeviceOnline(d));
}
/** Auto-select the best online device for a user (most recently seen). */
function pickDeviceForUser(userId) {
  const online = getOnlineDevicesByUser(userId);
  if (!online.length) return null;
  online.sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
  return online[0];
}
/** Paginated list of a user's messages, optionally filtered by type/status/device. */
function getMessagesByUser(userId, opts = {}) {
  const type = opts.type === 'all' ? null : (opts.type || 'sent');
  let list = Object.values(state.messages).filter((m) => m.user === userId && (type ? m.type === type : true));
  if (opts.status) list = list.filter((m) => m.status === opts.status);
  if (opts.deviceId) list = list.filter((m) => m.device === opts.deviceId);
  list.sort((a, b) => b.createdAt - a.createdAt);
  const page = opts.page || 1;
  const limit = Math.min(opts.limit || 50, 100);
  const start = (page - 1) * limit;
  return { data: list.slice(start, start + limit), total: list.length, page, limit };
}

// ---------------- admin: global listings ----------------
/** All devices across all users, newest-seen first, tagged with owner email. */
function getAllDevices() {
  return Object.values(state.devices)
    .sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0))
    .map((d) => ({ ...publicDevice(d), userEmail: (state.users[d.user] || {}).email || null }));
}
/** Enrich a message with owner email + device name for admin tables. */
function enrichMessage(m) {
  const d = state.devices[m.device] || {};
  return { ...m, userEmail: (state.users[m.user] || {}).email || null, deviceName: d.name || d.model || null };
}
/** Paginated list of ALL messages with optional filters + search (admin). */
function getAllMessages(opts = {}) {
  let list = Object.values(state.messages);
  if (opts.type) list = list.filter((m) => m.type === opts.type);
  if (opts.status) list = list.filter((m) => m.status === opts.status);
  if (opts.userId) list = list.filter((m) => m.user === opts.userId);
  if (opts.deviceId) list = list.filter((m) => m.device === opts.deviceId);
  if (opts.q) {
    const q = String(opts.q).toLowerCase();
    list = list.filter((m) =>
      (m.recipient || '').toLowerCase().includes(q) ||
      (m.sender || '').toLowerCase().includes(q) ||
      (m.message || '').toLowerCase().includes(q));
  }
  list.sort((a, b) => b.createdAt - a.createdAt);
  const page = opts.page || 1;
  const limit = Math.min(opts.limit || 50, 200);
  const start = (page - 1) * limit;
  return { data: list.slice(start, start + limit).map(enrichMessage), total: list.length, page, limit };
}
/** Paginated list of ALL batches (admin). */
function getAllBatches(opts = {}) {
  const list = Object.values(state.batches).sort((a, b) => b.createdAt - a.createdAt);
  const page = opts.page || 1;
  const limit = Math.min(opts.limit || 50, 200);
  const start = (page - 1) * limit;
  return {
    data: list.slice(start, start + limit).map((b) => ({
      ...b,
      userEmail: (state.users[b.user] || {}).email || null,
      deviceName: (state.devices[b.device] || {}).name || (state.devices[b.device] || {}).model || null,
    })),
    total: list.length, page, limit,
  };
}
/** Delete a single message record (admin). */
function deleteMessage(id) {
  const existed = !!state.messages[id];
  delete state.messages[id];
  if (existed) save();
  return existed;
}
/** Bulk-create users from an import list; skips duplicates, collects per-row errors. */
function importUsers(list) {
  const results = { created: 0, skipped: 0, errors: [] };
  (Array.isArray(list) ? list : []).forEach((entry, i) => {
    try {
      const email = String((entry && entry.email) || '').trim().toLowerCase();
      const password = String((entry && entry.password) || '');
      if (!email || !password) { results.errors.push(`Row ${i + 1}: email and password are required`); return; }
      if (findUserByEmail(email)) { results.skipped++; return; }
      createUser({ email, password, role: entry.role });
      results.created++;
    } catch (e) {
      results.errors.push(`Row ${i + 1}: ${e.message}`);
    }
  });
  return results;
}
/** Aggregated analytics for the admin dashboard charts. */
function getAnalytics() {
  const msgs = Object.values(state.messages);
  const byStatus = { pending: 0, dispatched: 0, sent: 0, delivered: 0, failed: 0, received: 0 };
  for (const m of msgs) {
    if (m.type === 'received') byStatus.received++;
    else if (byStatus[m.status] != null) byStatus[m.status]++;
  }
  const perDay = [];
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  for (let i = 13; i >= 0; i--) {
    const start = dayStart.getTime() - i * 86400000;
    const end = start + 86400000;
    const inRange = msgs.filter((m) => m.createdAt >= start && m.createdAt < end);
    perDay.push({
      date: new Date(start).toISOString().slice(0, 10),
      sent: inRange.filter((m) => m.type === 'sent').length,
      received: inRange.filter((m) => m.type === 'received').length,
      delivered: inRange.filter((m) => m.status === 'delivered').length,
      failed: inRange.filter((m) => m.status === 'failed').length,
    });
  }
  const topUsers = getAllUsers()
    .map((u) => ({ email: u.email, ...getStats(u.id) }))
    .filter((u) => u.sent > 0 || u.received > 0)
    .sort((a, b) => (b.sent + b.received) - (a.sent + a.received))
    .slice(0, 10);
  return { byStatus, perDay, topUsers };
}

// ---------------- stats ----------------
function getStats(userId) {
  const devices = getDevicesByUser(userId);
  const messages = Object.values(state.messages).filter((m) => m.user === userId);
  return {
    devices: devices.length,
    devicesOnline: devices.filter((d) => isDeviceOnline(d)).length,
    sent: messages.filter((m) => m.type === 'sent').length,
    received: messages.filter((m) => m.type === 'received').length,
    pending: messages.filter((m) => m.type === 'sent' && m.status === 'pending').length,
    delivered: messages.filter((m) => m.status === 'delivered').length,
    failed: messages.filter((m) => m.status === 'failed').length,
  };
}

module.exports = {
  createUser, findUserByEmail, findUserByApiKey, findUserById, rotateApiKey, publicUser, verifyPassword,
  createDevice, getDevice, getDevicesByUser, updateDevice, deleteDevice, touchDevice, rotateSim, publicDevice, isDeviceOnline,
  createBatch, createMessage, getMessage, getMessagesByDevice, getPendingMessages, claimMessages,
  updateMessageStatus, receiveSms, getBatch, getBatchWithMessages, getStats,
  getOnlineDevicesByUser, pickDeviceForUser, getMessagesByUser,
  ensureAdminBootstrap, listApiKeys, createApiKey, revokeApiKey, getAllUsers, updateUser, deleteUser,
  getAllDevices, getAllMessages, getAllBatches, deleteMessage, importUsers, getAnalytics,
};
