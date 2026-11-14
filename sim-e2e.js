/**
 * openOTP SIM-routing + anti-spam-code e2e test.
 * Expects server on PORT (default 3001).
 */
const BASE = `http://localhost:${process.env.PORT || 3001}`;
const EMAIL = `simtest-${Date.now()}@openotp.dev`;
let token, apiKey, deviceId;
let passed = 0, failed = 0;

async function call(method, path, { body, auth } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth === 'bearer') headers.Authorization = `Bearer ${token}`;
  if (auth === 'apikey') headers['x-api-key'] = apiKey;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
async function fetchMsg(smsId) {
  const r = await call('GET', `/gateway/devices/${deviceId}/sms/${smsId}`, { auth: 'bearer' });
  return r.json?.data;
}
function check(name, ok, extra = '') {
  if (ok) { passed++; console.log(`  PASS  ${name}${extra ? '  ' + extra : ''}`); }
  else { failed++; console.log(`  FAIL  ${name}${extra ? '  ' + extra : ''}`); }
}

(async () => {
  console.log(`\n[openOTP sim-e2e] target: ${BASE}\n`);

  const reg = await call('POST', '/api/auth/register', { body: { email: EMAIL, password: 'test123' } });
  token = reg.json?.data?.token; apiKey = reg.json?.data?.user?.apiKey;
  check('register', reg.status === 201 && token && apiKey);

  // Register device with 2 SIMs (like the Android app reports)
  const dev = await call('POST', '/gateway/devices', {
    auth: 'apikey',
    body: {
      brand: 'TestPhone', model: 'Dual SIM',
      simInfo: { sims: [
        { slotIndex: 0, subscriptionId: 3, carrierName: 'Carrier A', displayName: 'SIM 1', number: '+1111111111', countryIso: 'us' },
        { slotIndex: 1, subscriptionId: 5, carrierName: 'Carrier B', displayName: 'SIM 2', number: '+2222222222', countryIso: 'us' },
      ] },
    },
  });
  deviceId = dev.json?.data?.id;
  check('register device with simInfo', dev.status === 201 && deviceId);
  check('  -> publicDevice exposes simInfo', Array.isArray(dev.json?.data?.simInfo?.sims) && dev.json.data.simInfo.sims.length === 2);

  // Round-robin routing
  const rr = await call('PATCH', `/gateway/devices/${deviceId}`, { auth: 'apikey', body: { simRouting: { mode: 'roundrobin' } } });
  check('PATCH simRouting roundrobin', rr.status === 200 && rr.json?.data?.simRouting?.mode === 'roundrobin');

  // Send without SIM -> server assigns rotating SIM + spam code
  const s1 = await call('POST', `/gateway/devices/${deviceId}/send-sms`, { auth: 'apikey', body: { recipients: ['+1234567890'], message: 'code 1111' } });
  const m1 = await fetchMsg(s1.json?.data?.messages?.[0]?.smsId);
  check('send-sms (roundrobin #1)', s1.status === 200);
  check('  -> SIM assigned (sub 3, slot 0)', m1?.simSubscriptionId === 3 && m1?.simSlotIndex === 0, JSON.stringify({ sub: m1?.simSubscriptionId, slot: m1?.simSlotIndex }));
  check('  -> spam code appended on new line', typeof m1?.message === 'string' && /^code 1111\n#[A-Z2-9]{6}$/.test(m1.message), JSON.stringify(m1?.message));

  const s2 = await call('POST', `/gateway/devices/${deviceId}/send-sms`, { auth: 'apikey', body: { recipients: ['+1234567890'], message: 'code 2222' } });
  const m2 = await fetchMsg(s2.json?.data?.messages?.[0]?.smsId);
  check('send-sms (roundrobin #2) rotates to SIM 2', m2?.simSubscriptionId === 5 && m2?.simSlotIndex === 1, JSON.stringify({ sub: m2?.simSubscriptionId, slot: m2?.simSlotIndex }));
  check('  -> unique spam code each time', m1?.message !== m2?.message);

  // Fixed-SIM routing
  await call('PATCH', `/gateway/devices/${deviceId}`, { auth: 'apikey', body: { simRouting: { mode: 'sim', subscriptionId: 5, slotIndex: 1 } } });
  const s3 = await call('POST', `/gateway/devices/${deviceId}/send-sms`, { auth: 'apikey', body: { recipients: ['+1234567890'], message: 'code 3333' } });
  const m3 = await fetchMsg(s3.json?.data?.messages?.[0]?.smsId);
  check('send-sms uses configured fixed SIM', m3?.simSubscriptionId === 5 && m3?.simSlotIndex === 1);

  // Explicit per-send override wins
  const s4 = await call('POST', `/gateway/devices/${deviceId}/send-sms`, { auth: 'apikey', body: { recipients: ['+1234567890'], message: 'code 4444', simSubscriptionId: 3, simSlotIndex: 0 } });
  const m4 = await fetchMsg(s4.json?.data?.messages?.[0]?.smsId);
  check('explicit simSubscriptionId overrides routing', m4?.simSubscriptionId === 3 && m4?.simSlotIndex === 0);

  // 'any' mode -> nulls (phone default)
  await call('PATCH', `/gateway/devices/${deviceId}`, { auth: 'apikey', body: { simRouting: { mode: 'any' } } });
  const s5 = await call('POST', `/gateway/devices/${deviceId}/send-sms`, { auth: 'apikey', body: { recipients: ['+1234567890'], message: 'code 5555' } });
  const m5 = await fetchMsg(s5.json?.data?.messages?.[0]?.smsId);
  check("'any' mode leaves SIM to the phone", m5?.simSubscriptionId == null && m5?.simSlotIndex == null);

  // devices list exposes simInfo + simRouting for the dashboard
  const list = await call('GET', '/gateway/devices', { auth: 'bearer' });
  const d = (list.json?.data || []).find((x) => x.id === deviceId);
  check('GET /gateway/devices exposes simInfo+simRouting', d && Array.isArray(d.simInfo?.sims) && d.simRouting?.mode === 'any');

  console.log(`\n[openOTP sim-e2e] ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('crashed:', e); process.exit(1); });
