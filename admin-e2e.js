/**
 * openOTP admin API e2e test — exercises the admin table-management endpoints:
 *   login -> stats -> analytics -> users CRUD + import -> devices list/update/delete
 *   -> messages list/filter/search/delete -> batches -> client type filter
 * Usage: node admin-e2e.js  (expects server running on PORT, default 3001)
 * Env:   ADMIN_EMAIL / ADMIN_PASSWORD (default admin-e2e@openotp.dev)
 */
const BASE = `http://localhost:${process.env.PORT || 3001}`;
const EMAIL = process.env.ADMIN_EMAIL || 'admin-e2e@openotp.dev';
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin-e2e-pass-123';
const TS = Date.now();

let token = null;
let passed = 0, failed = 0;

async function call(method, path, { body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch { /* non-json */ }
  return { status: res.status, json };
}
async function gateway(method, path, apiKey, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch { /* non-json */ }
  return { status: res.status, json };
}
function check(name, ok, extra = '') {
  if (ok) { passed++; console.log(`  PASS  ${name}${extra ? '  ' + extra : ''}`); }
  else { failed++; console.log(`  FAIL  ${name}${extra ? '  ' + extra : ''}`); }
}

(async () => {
  console.log(`\n[openOTP admin-e2e] target: ${BASE}\n`);

  // 1. Login as admin
  const login = await call('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  check('login as admin', login.status === 200 && login.json.data.token, `(${EMAIL})`);
  token = login.json?.data?.token;

  // 2. Non-admin is rejected
  const reg = await call('POST', '/api/auth/register', { body: { email: `nonadmin-${TS}@openotp.dev`, password: 'nonadmin-pass' } });
  const adminToken = token;
  token = reg.json?.data?.token;
  const forbidden = await call('GET', '/api/admin/users');
  check('non-admin gets 403 on /api/admin/users', forbidden.status === 403);
  token = adminToken;

  // 3. Global stats include received
  const stats = await call('GET', '/api/admin/stats');
  check('GET /api/admin/stats (incl. received)', stats.status === 200 && typeof stats.json.data.received === 'number');

  // 4. Analytics (charts data)
  const analytics = await call('GET', '/api/admin/analytics');
  const a = analytics.json?.data || {};
  check('GET /api/admin/analytics', analytics.status === 200 && a.byStatus && Array.isArray(a.perDay) && a.perDay.length === 14 && Array.isArray(a.topUsers));

  // 5. Users CRUD
  const newUserEmail = `crud-${TS}@openotp.dev`;
  const created = await call('POST', '/api/admin/users', { body: { email: newUserEmail, password: 'crud-pass-123', role: 'client' } });
  check('POST /api/admin/users', created.status === 201 && created.json.data.id);
  const userId = created.json?.data?.id;

  const patched = await call('PATCH', `/api/admin/users/${userId}`, { body: { role: 'admin', enabled: false, password: 'new-pass-456' } });
  check('PATCH /api/admin/users/:id (role/enabled/password)', patched.status === 200 && patched.json.data.role === 'admin' && patched.json.data.enabled === false);

  const reEnabled = await call('PATCH', `/api/admin/users/${userId}`, { body: { enabled: true } });
  check('  -> re-enable works', reEnabled.status === 200 && reEnabled.json.data.enabled === true);

  const reLogin = await call('POST', '/api/auth/login', { body: { email: newUserEmail, password: 'new-pass-456' } });
  check('  -> password reset works (login with new password)', reLogin.status === 200);

  const dupEmail = await call('PATCH', `/api/admin/users/${userId}`, { body: { email: 'imadeddinekebour@gmail.com' } });
  check('  -> duplicate email rejected with 400', dupEmail.status === 400);

  const delUser = await call('DELETE', `/api/admin/users/${userId}`);
  check('DELETE /api/admin/users/:id', delUser.status === 200 && delUser.json.data.success);

  // 6. Bulk import
  const imp = await call('POST', '/api/admin/users/import', { body: { users: [
    { email: `import-a-${TS}@openotp.dev`, password: 'import-pass-1', role: 'client' },
    { email: `import-b-${TS}@openotp.dev`, password: 'import-pass-2' },
    { email: `import-c-${TS}@openotp.dev`, password: '' },
  ] } });
  check('POST /api/admin/users/import (2 created, 1 error)', imp.status === 200 && imp.json.data.created === 2 && imp.json.data.errors.length === 1, JSON.stringify(imp.json?.data || {}));
  const impDup = await call('POST', '/api/admin/users/import', { body: { users: [
    { email: `import-a-${TS}@openotp.dev`, password: 'import-pass-1' },
  ] } });
  check('  -> re-import skips duplicates', impDup.status === 200 && impDup.json.data.created === 0 && impDup.json.data.skipped === 1);

  // 7. Devices: a client registers one, admin manages it globally
  const devOwner = await call('POST', '/api/auth/register', { body: { email: `devowner-${TS}@openotp.dev`, password: 'dev-pass-123' } });
  const ownerKey = devOwner.json?.data?.user?.apiKey;
  const dev = await gateway('POST', '/gateway/devices', ownerKey, { name: 'Admin Test Phone', brand: 'TestBrand', model: 'TestModel' });
  const deviceId = dev.json?.data?.id;
  check('device self-registers via gateway', dev.status === 201 && deviceId);

  const devices = await call('GET', '/api/admin/devices');
  const listed = (devices.json?.data || []).find(d => d.id === deviceId);
  check('GET /api/admin/devices (with owner email)', devices.status === 200 && listed && listed.userEmail === `devowner-${TS}@openotp.dev`);

  // 8. Client sends a message (auto-routed to their online device)
  const send = await gateway('POST', '/api/v1/messages', ownerKey, { to: '+1234567890', message: 'admin e2e test message' });
  const smsId = send.json?.data?.id;
  check('client sends message via /api/v1 (auto-routed)', send.status === 201 && smsId);

  // 9. Admin message log: enriched + filters + search
  const msgs = await call('GET', '/api/admin/messages?page=1&limit=50');
  const found = (msgs.json?.data || []).find(m => m.id === smsId);
  check('GET /api/admin/messages (owner + device enriched)', msgs.status === 200 && found && found.userEmail === `devowner-${TS}@openotp.dev` && found.deviceName === 'Admin Test Phone');

  const filtered = await call('GET', '/api/admin/messages?type=sent&status=pending&q=' + encodeURIComponent('admin e2e'));
  check('GET /api/admin/messages?type=&status=&q= filters', filtered.status === 200 && (filtered.json?.data || []).some(m => m.id === smsId));

  // 10. Received SMS shows under client type filter
  const recv = await gateway('POST', `/gateway/devices/${deviceId}/receive-sms`, ownerKey, { sender: '+1987654321', message: 'reply to admin e2e', fingerprint: `fp-${TS}` });
  check('device forwards incoming SMS', recv.status === 200);
  const clientRecv = await gateway('GET', '/api/v1/messages?type=received', ownerKey);
  check('GET /api/v1/messages?type=received lists it', clientRecv.status === 200 && (clientRecv.json?.data || []).some(m => m.message === 'reply to admin e2e'));
  const clientSent = await gateway('GET', '/api/v1/messages?type=sent', ownerKey);
  check('GET /api/v1/messages?type=sent excludes received', clientSent.status === 200 && !(clientSent.json?.data || []).some(m => m.message === 'reply to admin e2e'));

  // 11. Admin deletes the message record
  const delMsg = await call('DELETE', `/api/admin/messages/${smsId}`);
  check('DELETE /api/admin/messages/:id', delMsg.status === 200);

  // 12. Admin updates + deletes the device
  const devPatch = await call('PATCH', `/api/admin/devices/${deviceId}`, { body: { name: 'Renamed by Admin', enabled: false, simRouting: { mode: 'roundrobin' } } });
  check('PATCH /api/admin/devices/:id (name/enabled/simRouting)', devPatch.status === 200 && devPatch.json.data.name === 'Renamed by Admin' && devPatch.json.data.enabled === false && devPatch.json.data.simRouting.mode === 'roundrobin');
  const delDev = await call('DELETE', `/api/admin/devices/${deviceId}`);
  check('DELETE /api/admin/devices/:id', delDev.status === 200);
  const devicesAfter = await call('GET', '/api/admin/devices');
  check('  -> device gone from list', !(devicesAfter.json?.data || []).some(d => d.id === deviceId));

  // 13. Batches
  const batches = await call('GET', '/api/admin/batches?page=1&limit=50');
  check('GET /api/admin/batches', batches.status === 200 && Array.isArray(batches.json.data) && typeof batches.json.total === 'number');

  console.log(`\n[openOTP admin-e2e] ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('[openOTP admin-e2e] crashed:', e); process.exit(1); });