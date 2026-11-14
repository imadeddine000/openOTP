import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';
import {
  Card, Button, Input, StatCard, StatusBadge, Table, Tabs,
  useAuth, fmtDate, Shell, Modal, Pagination, Notice, Select, DetailRows,
  toCSV, downloadFile, fetchAllPages,
} from '../ui.jsx';

const center = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const linkBtn = { background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, marginTop: 12, padding: 0, fontFamily: 'inherit' };

/* ================= auth ================= */

function AuthForm({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    try {
      const r = mode === 'login' ? await api.login(email, password) : await api.register(email, password);
      onLogin(r.data.token, r.data.user);
    } catch (e) { setError(e.message); }
  };
  return <div style={center}>
    <Card style={{ width: 420 }}>
      <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>open<span style={{ color: 'var(--accent)' }}>OTP</span></div>
      <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 18 }}>
        {mode === 'login' ? 'Sign in to your client portal' : 'Create your free account'}
      </div>
      <Input label="Email" value={email} onChange={setEmail} placeholder="you@company.com" />
      <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
      {error && <div style={{ color: 'var(--red)', marginBottom: 12, fontSize: 13 }}>{error}</div>}
      <Button onClick={submit} style={{ width: '100%' }}>{mode === 'login' ? 'Sign In' : 'Create Account'}</Button>
      <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} style={linkBtn}>
        {mode === 'login' ? 'Need an account? Register free' : 'Have an account? Sign in'}
      </button>
    </Card>
  </div>;
}

/* ================= dashboard (message-centric — no device noise) ================= */

function Dashboard({ user, onNav }) {
  const apiKey = user?.apiKey;
  const [s, setS] = useState(null);
  const [recent, setRecent] = useState([]);
  useEffect(() => {
    if (!apiKey) return;
    api.clientAccount(apiKey).then(r => setS(r.data)).catch(() => {});
    api.clientMessages(apiKey, { page: 1 }).then(r => setRecent(r.data)).catch(() => {});
  }, [apiKey]);
  if (!s) return <div style={{ color: 'var(--muted)' }}>Loading…</div>;
  const rate = s.messagesSent ? Math.round((s.messagesDelivered / s.messagesSent) * 100) : 0;
  return <div>
    <div className="page-title">Dashboard</div>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
      <StatCard label="Messages Sent" value={s.messagesSent} />
      <StatCard label="Delivered" value={s.messagesDelivered} color="var(--green)" />
      <StatCard label="Failed" value={s.messagesFailed} color="var(--red)" />
      <StatCard label="Pending" value={s.messagesPending} color="var(--accent)" />
    </div>
    <Card title="Delivery Rate" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1, height: 12, background: 'var(--bg)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{ width: rate + '%', height: '100%', background: 'linear-gradient(90deg,#22c55e,#4ade80)' }} />
        </div>
        <strong style={{ fontSize: 18, color: 'var(--green)' }}>{rate}%</strong>
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>
        {s.messagesDelivered} of {s.messagesSent} sent messages confirmed delivered.
      </div>
    </Card>
    <Card title="Recent Messages">
      {recent.length ? <Table columns={[
        { key: 'createdAt', label: 'Date', render: m => fmtDate(m.createdAt) },
        { key: 'to', label: 'To', render: m => <code style={{ fontSize: 12 }}>{m.to || m.sender || '—'}</code> },
        { key: 'message', label: 'Message', render: m => <span style={{ color: 'var(--muted)' }}>{(m.message || '').slice(0, 60)}</span> },
        { key: 'status', label: 'Status', render: m => <StatusBadge status={m.status} /> },
      ]} rows={recent} /> : <div style={{ color: 'var(--muted)', fontSize: 13, padding: 8 }}>
        No messages yet. <a href="#" onClick={e => { e.preventDefault(); onNav('Send SMS'); }}>Send your first message →</a>
      </div>}
    </Card>
  </div>;
}

/* ================= messages (sent + received) ================= */

function Messages({ user }) {
  const apiKey = user?.apiKey;
  const [type, setType] = useState('sent');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [res, setRes] = useState({ data: [], total: 0, page: 1, limit: 50 });
  const [view, setView] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    if (!apiKey) return;
    api.clientMessages(apiKey, { page, status, type }).then(setRes).catch(e => setErr(e.message));
  }, [apiKey, page, status, type]);
  useEffect(load, [load]);
  useEffect(() => { setPage(1); }, [type, status]);

  const exportCSV = async () => {
    const all = await fetchAllPages(p => api.clientMessages(apiKey, { page: p, status, type }));
    const cols = type === 'received'
      ? [
        { label: 'Received At', get: m => (m.receivedAt || m.createdAt) ? new Date(m.receivedAt || m.createdAt).toISOString() : '' },
        { label: 'From', get: m => m.sender || '' },
        { label: 'Message', key: 'message' },
      ]
      : [
        { label: 'Created', get: m => new Date(m.createdAt).toISOString() },
        { label: 'To', key: 'to' },
        { label: 'Message', key: 'message' },
        { label: 'Status', key: 'status' },
        { label: 'Delivered At', get: m => m.deliveredAt ? new Date(m.deliveredAt).toISOString() : '' },
        { label: 'Error', get: m => m.errorMessage || '' },
      ];
    downloadFile(`openotp-${type}-messages.csv`, toCSV(all, cols));
  };

  const cols = type === 'received' ? [
    { key: 'receivedAt', label: 'Received', render: m => fmtDate(m.receivedAt || m.createdAt) },
    { key: 'sender', label: 'From', render: m => <code style={{ fontSize: 12 }}>{m.sender || '—'}</code> },
    { key: 'message', label: 'Message', render: m => <span style={{ color: 'var(--muted)' }}>{(m.message || '').slice(0, 60)}</span> },
    { key: 'view', label: '', render: m => <Button variant="outline" onClick={() => setView(m)} style={{ padding: '3px 10px', fontSize: 12 }}>View</Button> },
  ] : [
    { key: 'createdAt', label: 'Date', render: m => fmtDate(m.createdAt) },
    { key: 'to', label: 'To', render: m => <code style={{ fontSize: 12 }}>{m.to}</code> },
    { key: 'message', label: 'Message', render: m => <span style={{ color: 'var(--muted)' }}>{(m.message || '').slice(0, 60)}</span> },
    { key: 'status', label: 'Status', render: m => <StatusBadge status={m.status} /> },
    { key: 'view', label: '', render: m => <Button variant="outline" onClick={() => setView(m)} style={{ padding: '3px 10px', fontSize: 12 }}>View</Button> },
  ];

  return <div>
    <div className="page-title">Messages</div>
    {err && <Notice kind="error" onClose={() => setErr('')}>{err}</Notice>}
    <div className="toolbar">
      <Tabs tabs={['Sent', 'Received']} active={type === 'sent' ? 'Sent' : 'Received'}
        onChange={t => setType(t.toLowerCase())} style={{ marginBottom: 0, borderBottom: 'none' }} />
      {type === 'sent' && <Select value={status} onChange={setStatus} options={[
        { value: '', label: 'All statuses' },
        { value: 'pending', label: 'Pending' },
        { value: 'dispatched', label: 'Dispatched' },
        { value: 'sent', label: 'Sent' },
        { value: 'delivered', label: 'Delivered' },
        { value: 'failed', label: 'Failed' },
      ]} />}
      <span className="spacer" />
      <Button variant="outline" onClick={exportCSV} style={{ padding: '8px 14px', fontSize: 13 }}>⬇ Export CSV</Button>
    </div>
    <Card>
      <Table columns={cols} rows={res.data} empty={type === 'sent' ? 'No sent messages yet' : 'No received messages yet'} />
      <Pagination page={res.page} limit={res.limit} total={res.total} onPage={setPage} />
    </Card>
    {view && <Modal title="Message Details" onClose={() => setView(null)} width={520}>
      <DetailRows rows={[
        ['ID', view.id],
        ['Type', view.type],
        ['To', view.to],
        ['From', view.sender],
        ['Message', view.message],
        ['Status', <StatusBadge status={view.status} />],
        ['Created', fmtDate(view.createdAt)],
        ['Sent', fmtDate(view.sentAt)],
        ['Delivered', fmtDate(view.deliveredAt)],
        ['Received', fmtDate(view.receivedAt)],
        ['Error', view.errorCode ? view.errorCode + ': ' + (view.errorMessage || '') : null],
      ]} />
    </Modal>}
  </div>;
}

/* ================= send sms ================= */

function SendSms({ user, onNav }) {
  const apiKey = user?.apiKey;
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const send = async () => {
    if (!to.trim() || !message.trim()) { setError('Recipient and message are required'); return; }
    setBusy(true); setError(''); setResult(null);
    try {
      const r = await api.clientSendMessage(apiKey, to.trim(), message);
      setResult(r.data);
      setTo(''); setMessage('');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <div>
    <div className="page-title">Send SMS</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 20, alignItems: 'start' }}>
      <Card title="New Message">
        {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
        <Input label="Recipient (international format)" value={to} onChange={setTo} placeholder="+15551234567" />
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Message</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} placeholder="Your verification code is 4821"
            style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: 8, fontSize: 14, resize: 'vertical', fontFamily: 'inherit' }} />
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, textAlign: 'right' }}>{message.length} chars</div>
        </div>
        <Button onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send Message'}</Button>
      </Card>
      <div>
        {result ? <Card title="Message Queued ✅">
          <DetailRows rows={[
            ['Message ID', <code style={{ fontSize: 12 }}>{result.id}</code>],
            ['Recipient', result.to],
            ['Status', <StatusBadge status={result.status} />],
          ]} />
          <div style={{ marginTop: 14, fontSize: 13, color: 'var(--muted)' }}>
            Your message is queued and will be dispatched automatically.{' '}
            <a href="#" onClick={e => { e.preventDefault(); onNav('Messages'); }}>Track it in Messages →</a>
          </div>
        </Card> : <Card title="Good to know">
          <ul style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.9, paddingLeft: 18 }}>
            <li>Use international format for recipients (<code>+15551234567</code>).</li>
            <li>A unique anti-spam code is appended automatically to protect delivery rates.</li>
            <li>Track delivery status (sent → delivered) under <strong>Messages</strong>.</li>
            <li>This page calls the same <code>/api/v1/messages</code> endpoint your app can use.</li>
          </ul>
        </Card>}
      </div>
    </div>
  </div>;
}

/* ================= api keys ================= */

function ApiKeys({ token }) {
  const [keys, setK] = useState([]);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const load = () => api.listApiKeys(token).then(r => setK(r.data)).catch(() => {});
  useEffect(load, []);
  const create = async () => {
    try { await api.createApiKey(token, label || 'Default'); setLabel(''); setError(''); load(); }
    catch (e) { setError(e.message); }
  };
  const revoke = async k => {
    if (confirm('Revoke key "' + k.label + '"? Apps using it will stop working immediately.')) {
      await api.revokeApiKey(token, k.id); load();
    }
  };
  const exportCSV = () => downloadFile('openotp-api-keys.csv', toCSV(keys, [
    { label: 'Label', key: 'label' },
    { label: 'Key', key: 'key' },
    { label: 'Created', get: k => new Date(k.createdAt).toISOString() },
  ]));
  const cols = [
    { key: 'label', label: 'Label', render: k => <strong style={{ fontSize: 13 }}>{k.label}</strong> },
    { key: 'key', label: 'API Key', render: k => <code style={{ fontSize: 12 }}>{k.key}</code> },
    { key: 'createdAt', label: 'Created', render: k => fmtDate(k.createdAt) },
    { key: 'actions', label: '', render: k => <Button variant="danger" onClick={() => revoke(k)} style={{ padding: '4px 10px', fontSize: 12 }}>Revoke</Button> },
  ];
  return <div>
    <div className="page-title">API Keys</div>
    <Card title="Generate API Key" style={{ marginBottom: 20 }}>
      {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Input value={label} onChange={setLabel} placeholder="label (e.g. Production backend)" />
        <Button onClick={create}>Generate</Button>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>
        Use keys in the <code>x-api-key</code> header when calling the API from your apps.
        Generate one per environment and revoke compromised keys instantly.
      </p>
    </Card>
    <div className="toolbar">
      <span className="spacer" />
      <Button variant="outline" onClick={exportCSV} style={{ padding: '8px 14px', fontSize: 13 }}>⬇ Export CSV</Button>
    </div>
    <Card><Table columns={cols} rows={keys} empty="No API keys yet — generate one above" /></Card>
  </div>;
}

/* ================= integration ================= */

function Integration({ user }) {
  const apiUrl = window.location.origin + '/api/v1';
  const key = user?.apiKey || 'sk_your_api_key';
  const examples = {
    cURL: 'curl -X POST ' + apiUrl + '/messages \\\n  -H "x-api-key: ' + key + '" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"to":"+15551234567","message":"Your code is 4821"}\'',
    JavaScript: 'const res = await fetch("' + apiUrl + '/messages", {\n  method: "POST",\n  headers: { "x-api-key": "' + key + '", "Content-Type": "application/json" },\n  body: JSON.stringify({ to: "+15551234567", message: "Your code is 4821" }),\n});\nconst { data } = await res.json();\nconsole.log(data.id, data.status);',
    Python: 'import requests\n\nres = requests.post(\n    "' + apiUrl + '/messages",\n    headers={"x-api-key": "' + key + '"},\n    json={"to": "+15551234567", "message": "Your code is 4821"},\n)\nprint(res.json()["data"])',
  };
  const [lang, setLang] = useState('cURL');
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(examples[lang])
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })
      .catch(() => {});
  };
  return <div>
    <div className="page-title">Integration</div>
    <Card title="Your Credentials" style={{ marginBottom: 20 }}>
      <DetailRows rows={[
        ['API URL', <code style={{ color: 'var(--accent)' }}>{apiUrl}</code>],
        ['Primary API Key', <code style={{ color: 'var(--accent)' }}>{key}</code>],
      ]} />
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12 }}>
        Send the <code>x-api-key</code> header with every request. Manage additional keys under <strong>API Keys</strong>.
      </p>
    </Card>
    <Card title="Send a Message" style={{ marginBottom: 20 }}>
      <div className="toolbar" style={{ marginBottom: 10 }}>
        <Tabs tabs={Object.keys(examples)} active={lang} onChange={setLang} style={{ marginBottom: 0, borderBottom: 'none' }} />
        <span className="spacer" />
        <Button variant="outline" onClick={copy} style={{ padding: '6px 14px', fontSize: 12.5 }}>{copied ? '✓ Copied' : 'Copy'}</Button>
      </div>
      <pre style={{ background: 'var(--bg)', border: '1px solid var(--border)', padding: 16, borderRadius: 10, overflowX: 'auto', fontSize: 12.5, lineHeight: 1.7, fontFamily: 'Consolas,Menlo,monospace' }}>{examples[lang]}</pre>
    </Card>
    <Card title="Endpoints">
      <DetailRows rows={[
        ['POST /messages', 'Send one message — { to, message }'],
        ['POST /messages/batch', 'Send many — { recipients: [...], message }'],
        ['GET /messages/:id', "Poll a message's delivery status"],
        ['GET /messages', 'List messages — ?page=&status=&type='],
        ['GET /account', 'Account info + usage totals'],
      ]} />
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 14 }}><a href="/client-api.html">→ Full API documentation</a></p>
    </Card>
  </div>;
}

/* ================= app ================= */

export default function ClientApp() {
  const { token, user, login, logout } = useAuth();
  const [tab, setTab] = useState('Dashboard');
  const nav = [
    { key: 'Dashboard', label: 'Dashboard', icon: '📊' },
    { key: 'Messages', label: 'Messages', icon: '💬' },
    { key: 'Send SMS', label: 'Send SMS', icon: '🚀' },
    { key: 'API Keys', label: 'API Keys', icon: '🔑' },
    { key: 'Integration', label: 'Integration', icon: '🧩' },
  ];
  if (!token) return <AuthForm onLogin={login} />;
  return <Shell app="Client" nav={nav} active={tab} onNav={setTab} user={user} onLogout={logout}>
    {tab === 'Dashboard' && <Dashboard user={user} onNav={setTab} />}
    {tab === 'Messages' && <Messages user={user} />}
    {tab === 'Send SMS' && <SendSms user={user} onNav={setTab} />}
    {tab === 'API Keys' && <ApiKeys token={token} />}
    {tab === 'Integration' && <Integration user={user} />}
  </Shell>;
}
