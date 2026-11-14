/**
 * openOTP end-to-end test — exercises the full SaaS gateway flow:
 *   health -> register -> login -> me -> create device -> send-sms -> claim
 *   -> sms-status (sent/delivered) -> receive-sms -> heartbeat -> stats -> history
 * Usage: node e2e-test.js  (expects server running, PORT env optional)
 */
const BASE = `http://localhost:${process.env.PORT || 3001}`;
const EMAIL = `test-${Date.now()}@openotp.dev`;
const PASSWORD = 'test-password-123';

let token = null;
let apiKey = null;
let deviceId = null;
let smsId = null;
let batchId = null;
let passed = 0;
let failed = 0;

async function call(method, path, { body, auth } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth === 'bearer' && token) headers.Authorization = `Bearer ${token}`;
  if (auth === 'apikey' && apiKey) headers['x-api-key'] = apiKey;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-json */ }
  return { status: res.status, json };
}

function check(name, ok, extra = '') {
  if (ok) { passed++; console.log(`  PASS  ${name}${extra ? '  ' + extra : ''}`); }
  else { failed++; console.log(`  FAIL  ${name}${extra ? '  ' + extra : ''}`); }
}

(async () => {
  console.log(`\n[openOTP e2e] target: ${BASE}\n`);

  // 1. Health
  const health = await call('GET', '/api/health');
  check('GET /api/health', health.status === 200 && health.json.status === 'ok');

  // 2. Register
  const reg = await call('POST', '/api/auth/register', { body: { email: EMAIL, password: PASSWORD } });
  check('POST /api/auth/register', reg.status === 201 && reg.json.data.token, `(${EMAIL})`);
  token = reg.json?.data?.token;
  apiKey = reg.json?.data?.user?.apiKey;

  // 3. Login
  const login = await call('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  check('POST /api/auth/login', login.status === 200 && login.json.data.token);
  token = login.json?.data?.token || token;

  // 4. Me (Bearer)
  const me = await call('GET', '/api/auth/me', { auth: 'bearer' });
  check('GET /api/auth/me (Bearer)', me.status === 200 && me.json.data.email === EMAIL);

  // 4b. Bad token rejected
  const badRes = await fetch(BASE + '/api/auth/me', { headers: { Authorization: 'Bearer invalid.token' } });
  check('GET /api/auth/me rejects invalid token', badRes.status === 401);

  // 5. Register device (x-api-key)
  const dev = await call('POST', '/gateway/devices', {
    auth: 'apikey',
    body: { name: 'Test Device', brand: 'Google', model: 'Pixel 7' },
  });
  check('POST /gateway/devices (x-api-key)', dev.status === 201 && dev.json.data.id, dev.json.data?.name ? `(${dev.json.data.name})` : '');
  deviceId = dev.json?.data?.id;

  // 6. Send SMS (queued as pending)
  const send = await call('POST', `/gateway/devices/${deviceId}/send-sms`, {
    auth: 'apikey',
    body: { recipients: ['+1234567890'], message: 'Your OTP is 4321' },
  });
  check('POST /gateway/devices/:id/send-sms', send.status === 200 && send.json.data.count === 1);
  smsId = send.json?.data?.messages?.[0]?.smsId;
  batchId = send.json?.data?.smsBatchId;
  check('  -> message queued with status pending', send.json?.data?.messages?.[0]?.status === 'pending');

  // 7. Claim (pull-based, like the Android app does)
  const claim = await call('POST', `/gateway/devices/${deviceId}/messages/claim`, { auth: 'apikey', body: { limit: 25 } });
  check('POST /gateway/devices/:id/messages/claim', claim.status === 200 && claim.json.data.length === 1);
  check('  -> claimed message matches queued smsId', claim.json?.data?.[0]?.smsId === smsId);
  check('  -> claimed message has recipient + body', claim.json?.data?.[0]?.recipient === '+1234567890' && /^Your OTP is 4321\n#[A-Z2-9]{6}$/.test(claim.json?.data?.[0]?.message || ''));

  // 8. Report status: sent
  const sent = await call('PATCH', `/gateway/devices/${deviceId}/sms-status`, {
    auth: 'apikey',
    body: { smsId, status: 'sent', sentAtInMillis: Date.now() },
  });
  check('PATCH sms-status -> sent', sent.status === 200 && sent.json.data.status === 'sent');

  // 9. Report status: delivered
  const delivered = await call('PATCH', `/gateway/devices/${deviceId}/sms-status`, {
    auth: 'apikey',
    body: { smsId, status: 'delivered', deliveredAtInMillis: Date.now() },
  });
  check('PATCH sms-status -> delivered', delivered.status === 200 && delivered.json.data.status === 'delivered');

  // 10. Receive SMS (incoming SMS forwarded from device)
  const fp = `fp-${Date.now()}`;
  const recv = await call('POST', `/gateway/devices/${deviceId}/receive-sms`, {
    auth: 'apikey',
    body: { sender: '+1987654321', message: 'Hi from a friend', fingerprint: fp },
  });
  check('POST /gateway/devices/:id/receive-sms', recv.status === 200 && recv.json.data.smsId);
  const recvId = recv.json?.data?.smsId;

  // 10b. Duplicate fingerprint ignored (same smsId returned)
  const dup = await call('POST', `/gateway/devices/${deviceId}/receive-sms`, {
    auth: 'apikey',
    body: { sender: '+1987654321', message: 'Hi from a friend', fingerprint: fp },
  });
  check('  -> duplicate receive-sms deduped', dup.status === 200 && dup.json?.data?.smsId === recvId);

  // 11. Heartbeat
  const hb = await call('POST', `/gateway/devices/${deviceId}/heartbeat`, {
    auth: 'apikey',
    body: { simInfo: { sim1: 'Carrier A' } },
  });
  check('POST /gateway/devices/:id/heartbeat', hb.status === 200 && hb.json.data.ok === true);

  // 12. Stats (Bearer)
  const stats = await call('GET', '/gateway/stats', { auth: 'bearer' });
  check('GET /gateway/stats (Bearer)', stats.status === 200);
  const s = stats.json?.data || {};
  check('  -> stats: 1 device online', s.devices === 1 && s.devicesOnline === 1, JSON.stringify(s));
  check('  -> stats: 1 delivered, 1 received', s.delivered === 1 && s.received === 1);

  // 13. Message history (Bearer)
  const history = await call('GET', `/gateway/devices/${deviceId}/sms?page=1&limit=50`, { auth: 'bearer' });
  check('GET /gateway/devices/:id/sms (history)', history.status === 200);

  // 14. Batch with messages (Bearer)
  const batch = await call('GET', `/gateway/devices/${deviceId}/sms-batch/${batchId}`, { auth: 'bearer' });
  check('GET /gateway/devices/:id/sms-batch/:batchId', batch.status === 200 && batch.json.data.status === 'delivered');

  // 15. Dashboard HTML served
  const html = await fetch(BASE + '/');
  const htmlBody = await html.text();
  check('GET / serves web dashboard', html.status === 200 && htmlBody.includes('<html'));

  // 16. Unauthorized gateway call rejected
  const unauth = await fetch(BASE + '/gateway/stats');
  check('GET /gateway/stats without auth -> 401', unauth.status === 401);

  console.log(`\n[openOTP e2e] ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('[openOTP e2e] crashed:', e); process.exit(1); });
