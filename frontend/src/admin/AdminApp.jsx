import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';
import {
  Card, Button, Input, Select, StatCard, Badge, StatusBadge, Table,
  useAuth, fmtDate, Shell, Modal, Pagination, Notice, SearchBox, DetailRows,
  toCSV, downloadFile, fetchAllPages, ImportDialog, BarChart, DonutChart,
} from '../ui.jsx';

const center = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' };

/* ================= auth ================= */

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    try { const r = await api.login(email, password); onLogin(r.data.token, r.data.user); }
    catch (e) { setError(e.message); }
  };
  return <div style={center}><Card style={{ width: 400 }}>
    <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 2 }}>open<span style={{ color: 'var(--accent)' }}>OTP</span> Admin</div>
    <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 18 }}>Sign in with an administrator account</div>
    <Input label="Email" value={email} onChange={setEmail} />
    <Input label="Password" type="password" value={password} onChange={setPassword} />
    {error && <div style={{ color: 'var(--red)', marginBottom: 12, fontSize: 13 }}>{error}</div>}
    <Button onClick={submit} style={{ width: '100%' }}>Login</Button>
  </Card></div>;
}

/* ================= overview (statistics) ================= */

function Overview({ token }) {
  const [s, setS] = useState(null);
  const [a, setA] = useState(null);
  useEffect(() => {
    api.adminStats(token).then(r => setS(r.data)).catch(() => {});
    api.adminAnalytics(token).then(r => setA(r.data)).catch(() => {});
  }, [token]);
  if (!s || !a) return <div style={{ color: 'var(--muted)' }}>Loading…</div>;
  const donut = [
    { label: 'Delivered', value: a.byStatus.delivered, color: '#22c55e' },
    { label: 'Sent', value: a.byStatus.sent, color: '#3b82f6' },
    { label: 'Pending', value: a.byStatus.pending, color: '#fbbf24' },
    { label: 'Dispatched', value: a.byStatus.dispatched, color: '#a78bfa' },
    { label: 'Failed', value: a.byStatus.failed, color: '#ef4444' },
    { label: 'Received', value: a.byStatus.received, color: '#8b94a5' },
  ];
  const bars = a.perDay.map(d => ({ label: d.date.slice(5), sent: d.sent, received: d.received }));
  return <div>
    <div className="page-title">Overview</div>
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
      <StatCard label="Users" value={s.users} />
      <StatCard label="Clients" value={s.clients} color="var(--accent)" />
      <StatCard label="Admins" value={s.admins} />
      <StatCard label="Devices" value={s.devices} />
      <StatCard label="Online" value={s.devicesOnline} color="var(--green)" />
    </div>
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
      <StatCard label="Sent" value={s.sent} />
      <StatCard label="Delivered" value={s.delivered} color="var(--green)" />
      <StatCard label="Failed" value={s.failed} color="var(--red)" />
      <StatCard label="Pending" value={s.pending} color="var(--accent)" />
      <StatCard label="Received" value={s.received} />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 20, marginBottom: 20 }}>
      <Card title="Message Status Mix">
        <DonutChart data={donut} />
      </Card>
      <Card title="Traffic — Last 14 Days">
        <BarChart data={bars} series={[
          { key: 'sent', label: 'Sent', color: '#ff7a18' },
          { key: 'received', label: 'Received', color: '#3b82f6' },
        ]} />
      </Card>
    </div>
    <Card title="Top Users by Volume">
      {a.topUsers.length ? <Table columns={[
        { key: 'email', label: 'User' },
        { key: 'sent', label: 'Sent' },
        { key: 'delivered', label: 'Delivered', render: u => <span style={{ color: 'var(--green)' }}>{u.delivered}</span> },
        { key: 'failed', label: 'Failed', render: u => <span style={{ color: 'var(--red)' }}>{u.failed}</span> },
        { key: 'received', label: 'Received' },
      ]} rows={a.topUsers} /> : <div style={{ color: 'var(--muted)', fontSize: 13, padding: 8 }}>No message activity yet.</div>}
    </Card>
  </div>;
}

/* ================= users (CRUD + import/export) ================= */

function UserModal({ user, onClose, onSave }) {
  const isNew = !user;
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(user?.role || 'client');
  const [enabled, setEnabled] = useState(user?.enabled !== false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!email.trim() || (isNew && !password)) { setError('Email and password are required'); return; }
    setBusy(true); setError('');
    try {
      await onSave({ email: email.trim(), password: password || undefined, role, enabled });
      onClose();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <Modal title={isNew ? 'Create User' : 'Edit User'} onClose={onClose}>
    {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
    <Input label="Email" value={email} onChange={setEmail} placeholder="user@company.com" />
    <Input label={isNew ? 'Password' : 'New password (optional)'} type="password" value={password} onChange={setPassword} placeholder={isNew ? 'initial password' : 'leave blank to keep current'} />
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Role</label>
      <Select value={role} onChange={setRole} options={[{ value: 'client', label: 'client' }, { value: 'admin', label: 'admin' }]} style={{ width: '100%' }} />
    </div>
    {!isNew && <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Status</label>
      <Select value={enabled ? '1' : '0'} onChange={v => setEnabled(v === '1')} options={[{ value: '1', label: 'Active' }, { value: '0', label: 'Disabled' }]} style={{ width: '100%' }} />
    </div>}
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : (isNew ? 'Create' : 'Save')}</Button>
    </div>
  </Modal>;
}

function Users({ token }) {
  const [users, setU] = useState([]);
  const [q, setQ] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null); // null | 'new' | user object
  const [importOpen, setImportOpen] = useState(false);
  const load = () => api.adminUsers(token).then(r => setU(r.data)).catch(() => {});
  useEffect(load, []);
  const filtered = users.filter(u => !q || u.email.toLowerCase().includes(q.toLowerCase()));
  const save = async (patch, existing) => {
    if (existing) {
      await api.adminUpdateUser(token, existing.id, patch);
      setNotice('Updated ' + (patch.email || existing.email));
    } else {
      await api.adminCreateUser(token, patch.email, patch.password, patch.role);
      setNotice('Created ' + patch.email);
    }
    load();
  };
  const del = async u => {
    if (confirm('Delete ' + u.email + '? Their devices and messages will be removed.')) {
      await api.adminDeleteUser(token, u.id);
      setNotice('Deleted ' + u.email);
      load();
    }
  };
  const exportCSV = () => downloadFile('openotp-users.csv', toCSV(filtered, [
    { label: 'Email', key: 'email' },
    { label: 'Role', key: 'role' },
    { label: 'Enabled', get: u => (u.enabled ? 'yes' : 'no') },
    { label: 'Devices', get: u => u.stats?.devices || 0 },
    { label: 'Sent', get: u => u.stats?.sent || 0 },
    { label: 'Delivered', get: u => u.stats?.delivered || 0 },
    { label: 'Failed', get: u => u.stats?.failed || 0 },
    { label: 'Created', get: u => new Date(u.createdAt).toISOString() },
  ]));
  const exportJSON = () => downloadFile('openotp-users.json', JSON.stringify(filtered, null, 2), 'application/json');
  const cols = [
    { key: 'email', label: 'Email', render: u => <strong style={{ fontSize: 13 }}>{u.email}</strong> },
    { key: 'role', label: 'Role', render: u => <Badge color={u.role === 'admin' ? 'orange' : 'blue'}>{u.role}</Badge> },
    { key: 'enabled', label: 'Status', render: u => <Badge color={u.enabled ? 'green' : 'red'}>{u.enabled ? 'Active' : 'Disabled'}</Badge> },
    { key: 'devices', label: 'Devices', render: u => u.stats?.devices || 0 },
    { key: 'sent', label: 'Sent', render: u => u.stats?.sent || 0 },
    { key: 'delivered', label: 'Delivered', render: u => u.stats?.delivered || 0 },
    { key: 'failed', label: 'Failed', render: u => u.stats?.failed || 0 },
    { key: 'createdAt', label: 'Created', render: u => fmtDate(u.createdAt) },
    { key: 'actions', label: 'Actions', render: u => <div style={{ display: 'flex', gap: 6 }}>
      <Button variant="outline" onClick={() => setModal(u)} style={{ padding: '4px 10px', fontSize: 12 }}>Edit</Button>
      <Button variant="danger" onClick={() => del(u)} style={{ padding: '4px 10px', fontSize: 12 }}>Delete</Button>
    </div> },
  ];
  return <div>
    <div className="page-title">Users</div>
    {notice && <Notice kind="success" onClose={() => setNotice('')}>{notice}</Notice>}
    <div className="toolbar">
      <SearchBox value={q} onChange={setQ} placeholder="Search by email…" />
      <span className="spacer" />
      <Button onClick={() => setModal('new')} style={{ padding: '8px 16px', fontSize: 13 }}>+ Create User</Button>
      <Button variant="outline" onClick={() => setImportOpen(true)} style={{ padding: '8px 14px', fontSize: 13 }}>⬆ Import</Button>
      <Button variant="outline" onClick={exportCSV} style={{ padding: '8px 14px', fontSize: 13 }}>⬇ CSV</Button>
      <Button variant="outline" onClick={exportJSON} style={{ padding: '8px 14px', fontSize: 13 }}>⬇ JSON</Button>
    </div>
    <Card>
      <Table columns={cols} rows={filtered} empty="No users found" />
    </Card>
    {modal && <UserModal user={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSave={patch => save(patch, modal === 'new' ? null : modal)} />}
    {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImport={async rows => {
      const r = await api.adminImportUsers(token, rows);
      load();
      return r.data;
    }} hint="Upload a CSV or JSON file with columns: email, password, role (client or admin). Rows with existing emails are skipped." />}
  </div>;
}

/* ================= devices (global CRUD) ================= */

function DeviceModal({ device, onClose, onSave }) {
  const [name, setName] = useState(device.name || '');
  const [enabled, setEnabled] = useState(device.enabled !== false);
  const r = device.simRouting || {};
  const [mode, setMode] = useState(r.mode || 'any');
  const [subId, setSubId] = useState(r.subscriptionId != null ? String(r.subscriptionId) : '');
  const [slot, setSlot] = useState(r.slotIndex != null ? String(r.slotIndex) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    const simRouting = { mode };
    if (mode === 'sim') {
      if (subId === '') { setError('subscriptionId is required for fixed-SIM routing'); setBusy(false); return; }
      simRouting.subscriptionId = parseInt(subId, 10);
      if (slot !== '') simRouting.slotIndex = parseInt(slot, 10);
    }
    try { await onSave({ name: name.trim() || null, enabled, simRouting }); onClose(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <Modal title={'Edit Device — ' + (device.name || device.model || device.id.slice(0, 8))} onClose={onClose}>
    {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
    <Input label="Name" value={name} onChange={setName} placeholder="Office Pixel" />
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Status</label>
      <Select value={enabled ? '1' : '0'} onChange={v => setEnabled(v === '1')} options={[{ value: '1', label: 'Enabled' }, { value: '0', label: 'Disabled' }]} style={{ width: '100%' }} />
    </div>
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>SIM Routing</label>
      <Select value={mode} onChange={setMode} options={[
        { value: 'any', label: 'Any — let the phone pick' },
        { value: 'roundrobin', label: 'Round-robin across SIMs' },
        { value: 'sim', label: 'Fixed SIM' },
      ]} style={{ width: '100%' }} />
    </div>
    {mode === 'sim' && <div style={{ display: 'flex', gap: 10 }}>
      <Input label="subscriptionId" value={subId} onChange={setSubId} placeholder="3" />
      <Input label="slotIndex (optional)" value={slot} onChange={setSlot} placeholder="0" />
    </div>}
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
    </div>
  </Modal>;
}

function Devices({ token }) {
  const [devices, setD] = useState([]);
  const [q, setQ] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const load = () => api.adminDevices(token).then(r => setD(r.data)).catch(() => {});
  useEffect(load, []);
  const filtered = devices.filter(d => !q || [d.name, d.model, d.brand, d.userEmail].some(f => (f || '').toLowerCase().includes(q.toLowerCase())));
  const toggle = async d => { await api.adminUpdateDevice(token, d.id, { enabled: !d.enabled }); load(); };
  const del = async d => {
    if (confirm('Delete device "' + (d.name || d.model || d.id.slice(0, 8)) + '"? Its message history will be removed.')) {
      await api.adminDeleteDevice(token, d.id);
      setNotice('Device deleted');
      load();
    }
  };
  const save = async patch => { await api.adminUpdateDevice(token, editing.id, patch); setNotice('Device updated'); load(); };
  const exportCSV = () => downloadFile('openotp-devices.csv', toCSV(filtered, [
    { label: 'Name', get: d => d.name || '' },
    { label: 'Owner', key: 'userEmail' },
    { label: 'Brand', get: d => d.brand || '' },
    { label: 'Model', get: d => d.model || '' },
    { label: 'Online', get: d => (d.online ? 'yes' : 'no') },
    { label: 'Enabled', get: d => (d.enabled ? 'yes' : 'no') },
    { label: 'SIMs', get: d => (d.simInfo?.sims || []).length },
    { label: 'Sent', key: 'sentSMSCount' },
    { label: 'Received', key: 'receivedSMSCount' },
    { label: 'Last Seen', get: d => new Date(d.lastSeenAt || 0).toISOString() },
  ]));
  const exportJSON = () => downloadFile('openotp-devices.json', JSON.stringify(filtered, null, 2), 'application/json');
  const cols = [
    { key: 'name', label: 'Device', render: d => <div>
      <strong style={{ fontSize: 13 }}>{d.name || d.model || d.id.slice(0, 8)}</strong>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{[d.brand, d.model].filter(Boolean).join(' ')}</div>
    </div> },
    { key: 'userEmail', label: 'Owner', render: d => <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{d.userEmail || '—'}</span> },
    { key: 'online', label: 'Connection', render: d => <Badge color={d.online ? 'green' : 'red'}>{d.online ? 'Online' : 'Offline'}</Badge> },
    { key: 'enabled', label: 'Enabled', render: d => <Button variant="outline" onClick={() => toggle(d)} style={{ padding: '3px 10px', fontSize: 12 }}>{d.enabled ? 'Yes' : 'No'}</Button> },
    { key: 'sims', label: 'SIMs', render: d => (d.simInfo?.sims || []).length },
    { key: 'sentSMSCount', label: 'Sent', render: d => d.sentSMSCount || 0 },
    { key: 'receivedSMSCount', label: 'Recv', render: d => d.receivedSMSCount || 0 },
    { key: 'lastSeenAt', label: 'Last Seen', render: d => fmtDate(d.lastSeenAt) },
    { key: 'actions', label: 'Actions', render: d => <div style={{ display: 'flex', gap: 6 }}>
      <Button variant="outline" onClick={() => setEditing(d)} style={{ padding: '4px 10px', fontSize: 12 }}>Edit</Button>
      <Button variant="danger" onClick={() => del(d)} style={{ padding: '4px 10px', fontSize: 12 }}>Delete</Button>
    </div> },
  ];
  return <div>
    <div className="page-title">Devices</div>
    {notice && <Notice kind="success" onClose={() => setNotice('')}>{notice}</Notice>}
    <div className="toolbar">
      <SearchBox value={q} onChange={setQ} placeholder="Search name, model, owner…" />
      <span className="spacer" />
      <Button variant="outline" onClick={exportCSV} style={{ padding: '8px 14px', fontSize: 13 }}>⬇ CSV</Button>
      <Button variant="outline" onClick={exportJSON} style={{ padding: '8px 14px', fontSize: 13 }}>⬇ JSON</Button>
    </div>
    <Card>
      <Table columns={cols} rows={filtered} empty="No devices registered yet — devices self-register from the Android gateway app" />
    </Card>
    {editing && <DeviceModal device={editing} onClose={() => setEditing(null)} onSave={save} />}
  </div>;
}

/* ================= messages (global log) ================= */

function AdminMessages({ token }) {
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [res, setRes] = useState({ data: [], total: 0, page: 1, limit: 50 });
  const [view, setView] = useState(null);
  const [notice, setNotice] = useState('');

  const qs = p => '?page=' + p + '&limit=50' + (type ? '&type=' + type : '') + (status ? '&status=' + status : '') + (q ? '&q=' + encodeURIComponent(q) : '');
  const load = useCallback(() => {
    api.adminMessages(token, qs(page)).then(setRes).catch(() => {});
  }, [token, page, type, status, q]);
  useEffect(load, [load]);
  useEffect(() => { setPage(1); }, [type, status, q]);

  const del = async m => {
    if (confirm('Delete this message record? This cannot be undone.')) {
      await api.adminDeleteMessage(token, m.id);
      setNotice('Message deleted');
      load();
    }
  };
  const exportCSV = async () => {
    const all = await fetchAllPages(p => api.adminMessages(token, qs(p)));
    downloadFile('openotp-messages.csv', toCSV(all, [
      { label: 'ID', key: 'id' },
      { label: 'Created', get: m => new Date(m.createdAt).toISOString() },
      { label: 'Type', key: 'type' },
      { label: 'From', get: m => m.sender || '' },
      { label: 'To', get: m => m.recipient || '' },
      { label: 'Message', key: 'message' },
      { label: 'Status', key: 'status' },
      { label: 'Owner', key: 'userEmail' },
      { label: 'Device', key: 'deviceName' },
      { label: 'Delivered At', get: m => (m.deliveredAt ? new Date(m.deliveredAt).toISOString() : '') },
      { label: 'Error', get: m => m.errorMessage || '' },
    ]));
  };
  const cols = [
    { key: 'createdAt', label: 'Date', render: m => fmtDate(m.createdAt) },
    { key: 'type', label: 'Type', render: m => <Badge color={m.type === 'received' ? 'gray' : 'blue'}>{m.type}</Badge> },
    { key: 'party', label: 'From / To', render: m => <code style={{ fontSize: 12 }}>{m.type === 'received' ? (m.sender || '—') : (m.recipient || '—')}</code> },
    { key: 'message', label: 'Message', render: m => <span style={{ color: 'var(--muted)' }}>{(m.message || '').slice(0, 50)}{(m.message || '').length > 50 ? '…' : ''}</span> },
    { key: 'status', label: 'Status', render: m => <StatusBadge status={m.status} /> },
    { key: 'userEmail', label: 'Owner', render: m => <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{m.userEmail || '—'}</span> },
    { key: 'actions', label: 'Actions', render: m => <div style={{ display: 'flex', gap: 6 }}>
      <Button variant="outline" onClick={() => setView(m)} style={{ padding: '4px 10px', fontSize: 12 }}>View</Button>
      <Button variant="danger" onClick={() => del(m)} style={{ padding: '4px 10px', fontSize: 12 }}>Delete</Button>
    </div> },
  ];
  return <div>
    <div className="page-title">Messages</div>
    {notice && <Notice kind="success" onClose={() => setNotice('')}>{notice}</Notice>}
    <div className="toolbar">
      <Select value={type} onChange={setType} options={[
        { value: '', label: 'All types' },
        { value: 'sent', label: 'Sent' },
        { value: 'received', label: 'Received' },
      ]} />
      <Select value={status} onChange={setStatus} options={[
        { value: '', label: 'All statuses' },
        { value: 'pending', label: 'Pending' },
        { value: 'dispatched', label: 'Dispatched' },
        { value: 'sent', label: 'Sent' },
        { value: 'delivered', label: 'Delivered' },
        { value: 'failed', label: 'Failed' },
      ]} />
      <SearchBox value={qInput} onChange={setQInput} onEnter={() => setQ(qInput)} placeholder="Search recipient, sender, text…" />
      <Button variant="outline" onClick={() => setQ(qInput)} style={{ padding: '8px 14px', fontSize: 13 }}>Search</Button>
      <span className="spacer" />
      <Button variant="outline" onClick={exportCSV} style={{ padding: '8px 14px', fontSize: 13 }}>⬇ Export CSV</Button>
    </div>
    <Card>
      <Table columns={cols} rows={res.data} empty="No messages found" />
      <Pagination page={res.page} limit={res.limit} total={res.total} onPage={setPage} />
    </Card>
    {view && <Modal title="Message Details" onClose={() => setView(null)} width={560}>
      <DetailRows rows={[
        ['ID', view.id],
        ['Type', view.type],
        ['Owner', view.userEmail],
        ['Device', view.deviceName || view.device],
        ['From', view.sender],
        ['To', view.recipient],
        ['Message', view.message],
        ['Status', <StatusBadge status={view.status} />],
        ['SIM', view.simSubscriptionId != null ? 'subscription ' + view.simSubscriptionId + (view.simSlotIndex != null ? ' (slot ' + view.simSlotIndex + ')' : '') : null],
        ['Created', fmtDate(view.createdAt)],
        ['Sent', fmtDate(view.sentAt)],
        ['Delivered', fmtDate(view.deliveredAt)],
        ['Failed', fmtDate(view.failedAt)],
        ['Error', view.errorCode ? view.errorCode + ': ' + (view.errorMessage || '') : null],
      ]} />
    </Modal>}
  </div>;
}

/* ================= batches (global log) ================= */

function Batches({ token }) {
  const [page, setPage] = useState(1);
  const [res, setRes] = useState({ data: [], total: 0, page: 1, limit: 50 });
  const load = useCallback(() => {
    api.adminBatches(token, '?page=' + page + '&limit=50').then(setRes).catch(() => {});
  }, [token, page]);
  useEffect(load, [load]);
  const exportCSV = async () => {
    const all = await fetchAllPages(p => api.adminBatches(token, '?page=' + p + '&limit=50'));
    downloadFile('openotp-batches.csv', toCSV(all, [
      { label: 'ID', key: 'id' },
      { label: 'Created', get: b => new Date(b.createdAt).toISOString() },
      { label: 'Owner', key: 'userEmail' },
      { label: 'Device', key: 'deviceName' },
      { label: 'Message', key: 'message' },
      { label: 'Recipients', key: 'recipientCount' },
      { label: 'Status', key: 'status' },
    ]));
  };
  const cols = [
    { key: 'createdAt', label: 'Date', render: b => fmtDate(b.createdAt) },
    { key: 'userEmail', label: 'Owner', render: b => <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{b.userEmail || '—'}</span> },
    { key: 'deviceName', label: 'Device', render: b => b.deviceName || '—' },
    { key: 'message', label: 'Message', render: b => <span style={{ color: 'var(--muted)' }}>{(b.message || '').slice(0, 60)}{(b.message || '').length > 60 ? '…' : ''}</span> },
    { key: 'recipientCount', label: 'Recipients', render: b => <strong>{b.recipientCount}</strong> },
    { key: 'status', label: 'Status', render: b => <StatusBadge status={b.status} /> },
  ];
  return <div>
    <div className="page-title">Batches</div>
    <div className="toolbar">
      <span className="spacer" />
      <Button variant="outline" onClick={exportCSV} style={{ padding: '8px 14px', fontSize: 13 }}>⬇ Export CSV</Button>
    </div>
    <Card>
      <Table columns={cols} rows={res.data} empty="No batches yet" />
      <Pagination page={res.page} limit={res.limit} total={res.total} onPage={setPage} />
    </Card>
  </div>;
}

/* ================= app ================= */

export default function AdminApp() {
  const { token, user, login, logout } = useAuth();
  const [tab, setTab] = useState('Overview');
  const nav = [
    { key: 'Overview', label: 'Overview', icon: '📈' },
    { key: 'Users', label: 'Users', icon: '👥' },
    { key: 'Devices', label: 'Devices', icon: '📱' },
    { key: 'Messages', label: 'Messages', icon: '✉️' },
    { key: 'Batches', label: 'Batches', icon: '📦' },
  ];
  if (!token) return <Login onLogin={login} />;
  return <Shell app="Admin" nav={nav} active={tab} onNav={setTab} user={user} onLogout={logout}>
    {tab === 'Overview' && <Overview token={token} />}
    {tab === 'Users' && <Users token={token} />}
    {tab === 'Devices' && <Devices token={token} />}
    {tab === 'Messages' && <AdminMessages token={token} />}
    {tab === 'Batches' && <Batches token={token} />}
  </Shell>;
}
