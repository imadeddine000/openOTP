import { useState } from 'react';

/* ---------------- primitives ---------------- */

export function Card({ children, title, style }) {
  return <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, ...style }}>
    {title && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</div>}
    {children}
  </div>;
}

export function Button({ children, onClick, variant = 'primary', disabled, style, title }) {
  const bg = variant === 'primary' ? 'var(--accent)' : variant === 'danger' ? 'var(--red)' : 'transparent';
  const color = variant === 'outline' ? 'var(--text)' : '#fff';
  return <button title={title} onClick={onClick} disabled={disabled} style={{ background: bg, color, border: variant === 'outline' ? '1px solid var(--border)' : 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, fontSize: 14, fontFamily: 'inherit', ...style }}>{children}</button>;
}

export function Input({ value, onChange, placeholder, type = 'text', label }) {
  return <div style={{ marginBottom: 12 }}>
    {label && <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{label}</label>}
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }} />
  </div>;
}

export function Select({ value, onChange, options, style }) {
  return <select value={value} onChange={e => onChange(e.target.value)} style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '9px 10px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', ...style }}>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>;
}

export function StatCard({ label, value, color }) {
  return <Card style={{ textAlign: 'center', minWidth: 130, flex: '1 1 130px' }}>
    <div style={{ fontSize: 28, fontWeight: 800, color: color || 'var(--text)' }}>{value}</div>
    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{label}</div>
  </Card>;
}

export function Badge({ children, color }) {
  const colors = { green: '#22c55e', red: '#ef4444', orange: '#fbbf24', blue: '#3b82f6', gray: '#8b94a5' };
  const c = colors[color] || colors.gray;
  return <span style={{ background: c + '22', color: c, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{children}</span>;
}

export function StatusBadge({ status }) {
  const map = { pending: 'orange', dispatched: 'blue', sent: 'blue', delivered: 'green', failed: 'red', received: 'gray', partial: 'orange' };
  return <Badge color={map[status] || 'gray'}>{status}</Badge>;
}

export function Table({ columns, rows, empty }) {
  if (!rows.length) return <div style={{ color: 'var(--muted)', padding: 16, textAlign: 'center' }}>{empty || 'No data'}</div>;
  return <div style={{ overflowX: 'auto' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead><tr>{columns.map(c => <th key={c.key} style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{columns.map(c => <td key={c.key} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }}>{c.render ? c.render(r) : r[c.key]}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}

export function Tabs({ tabs, active, onChange, style }) {
  return <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20, ...style }}>
    {tabs.map(t => <button key={t} onClick={() => onChange(t)} style={{ background: 'none', border: 'none', color: active === t ? 'var(--accent)' : 'var(--muted)', padding: '12px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: 'inherit', borderBottom: active === t ? '2px solid var(--accent)' : '2px solid transparent' }}>{t}</button>)}
  </div>;
}

/* ---------------- feedback ---------------- */

export function Notice({ kind, children, onClose }) {
  if (!children) return null;
  const color = kind === 'error' ? 'var(--red)' : kind === 'success' ? 'var(--green)' : 'var(--accent)';
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, background: color + '18', border: '1px solid ' + color + '55', color, padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
    <span>{children}</span>
    {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color, cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>}
  </div>;
}

export function Modal({ title, onClose, children, width = 460 }) {
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
    <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, width, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <strong style={{ fontSize: 16 }}>{title}</strong>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
      </div>
      {children}
    </div>
  </div>;
}

export function DetailRows({ rows }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {rows.filter(([, v]) => v != null && v !== '').map(([k, v], i) => (
      <div key={i} style={{ display: 'flex', gap: 12, fontSize: 13 }}>
        <span style={{ color: 'var(--muted)', minWidth: 90, flexShrink: 0 }}>{k}</span>
        <span style={{ flex: 1, wordBreak: 'break-word' }}>{v}</span>
      </div>
    ))}
  </div>;
}

/* ---------------- app shell (sidebar layout) ---------------- */

export function Shell({ app, nav, active, onNav, user, onLogout, children }) {
  return <div className="shell">
    <aside className="sidebar">
      <div className="sidebar-brand" onClick={() => onNav(nav[0].key)}>
        <span className="logo">openOTP</span>
        <span className="sidebar-app">{app}</span>
      </div>
      <nav className="sidenav">
        {nav.map(n => <button key={n.key} className={'sidenav-item' + (active === n.key ? ' active' : '')} onClick={() => onNav(n.key)}>
          <span className="sidenav-icon">{n.icon}</span><span>{n.label}</span>
        </button>)}
      </nav>
      <div className="sidebar-foot">
        <div className="sidebar-user">{user?.email}</div>
        <button className="linkish" onClick={onLogout}>Log out</button>
      </div>
    </aside>
    <main className="main">{children}</main>
  </div>;
}

/* ---------------- data helpers ---------------- */

export function Pagination({ page, limit, total, onPage }) {
  if (!total) return null;
  const pages = Math.max(1, Math.ceil(total / limit));
  return <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', marginTop: 14, fontSize: 13, color: 'var(--muted)', flexWrap: 'wrap' }}>
    <span>{total} item{total === 1 ? '' : 's'}</span>
    <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)} style={{ padding: '4px 12px', fontSize: 12 }}>← Prev</Button>
    <span>Page {page} / {pages}</span>
    <Button variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)} style={{ padding: '4px 12px', fontSize: 12 }}>Next →</Button>
  </div>;
}

export function SearchBox({ value, onChange, onEnter, placeholder = 'Search…' }) {
  return <input value={value} onChange={e => onChange(e.target.value)}
    onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter(); }}
    placeholder={placeholder}
    style={{ flex: 1, minWidth: 180, maxWidth: 320, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '9px 12px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }} />;
}

/** Convert rows to CSV. cols: [{ label, key?, get? }] */
export function toCSV(rows, cols) {
  const esc = v => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = cols.map(c => esc(c.label)).join(',');
  const lines = rows.map(r => cols.map(c => esc(c.get ? c.get(r) : r[c.key])).join(','));
  return [head, ...lines].join('\n');
}

/** Trigger a browser download of a text file. */
export function downloadFile(name, content, mime = 'text/csv') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Minimal CSV parser (handles quoted fields). Returns array of arrays. */
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(f => String(f).trim() !== ''));
}

/** Parse CSV text into objects using the first row as header. */
export function csvToObjects(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const o = {};
    header.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
    return o;
  });
}

/** Fetch every page of a paginated endpoint (capped). fetchPage(page) -> { data, total } */
export async function fetchAllPages(fetchPage, max = 5000) {
  const all = [];
  let page = 1;
  let total = Infinity;
  while (all.length < total && all.length < max && page <= 200) {
    const r = await fetchPage(page);
    if (!r || !Array.isArray(r.data)) break;
    all.push(...r.data);
    total = r.total != null ? r.total : all.length;
    if (!r.data.length) break;
    page++;
  }
  return all;
}

/* ---------------- charts (no external deps) ---------------- */

/** Grouped vertical bar chart. data: [{ label, ...seriesKeys }], series: [{ key, label, color }] */
export function BarChart({ data, series, height = 200 }) {
  const max = Math.max(1, ...data.flatMap(d => series.map(s => d[s.key] || 0)));
  const plotH = height - 24;
  return <div>
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}
          title={d.label + ': ' + series.map(s => s.label + ' ' + (d[s.key] || 0)).join(' · ')}>
          <div style={{ display: 'flex', gap: 2, justifyContent: 'center', alignItems: 'flex-end', height: plotH }}>
            {series.map(s => (
              <div key={s.key} style={{ width: 9, height: Math.round(((d[s.key] || 0) / max) * plotH), background: s.color, borderRadius: '3px 3px 0 0', minHeight: (d[s.key] || 0) > 0 ? 3 : 0 }} />
            ))}
          </div>
          <div style={{ fontSize: 9, color: 'var(--muted)', textAlign: 'center', marginTop: 4 }}>{d.label}</div>
        </div>
      ))}
    </div>
    <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap' }}>
      {series.map(s => <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: 'inline-block' }} />{s.label}
      </span>)}
    </div>
  </div>;
}

/** SVG donut chart with legend. data: [{ label, value, color }] */
export function DonutChart({ data, size = 180, thickness = 24, centerLabel = 'messages' }) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={thickness} />
        {total > 0 && data.filter(d => d.value > 0).map((d, i) => {
          const len = ((d.value || 0) / total) * circ;
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth={thickness}
            strokeDasharray={len + ' ' + (circ - len)} strokeDashoffset={-acc} />;
          acc += len;
          return el;
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 800 }}>{total}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{centerLabel}</div>
      </div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.map((d, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color, display: 'inline-block' }} />
        <span style={{ color: 'var(--muted)', minWidth: 84 }}>{d.label}</span>
        <strong>{d.value || 0}</strong>
      </div>)}
    </div>
  </div>;
}

/* ---------------- import dialog ---------------- */

export function ImportDialog({ onClose, onImport, hint }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const parse = text => {
    setError(''); setResult(null);
    const t = String(text || '').trim();
    if (!t) { setError('File is empty'); return; }
    let list = [];
    try {
      if (t.startsWith('[') || t.startsWith('{')) {
        const json = JSON.parse(t);
        list = Array.isArray(json) ? json : (Array.isArray(json.users) ? json.users : []);
      } else {
        list = csvToObjects(t);
      }
    } catch (e) { setError('Could not parse file: ' + e.message); return; }
    const clean = list.map(r => ({
      email: String(r.email || '').trim(),
      password: String(r.password || '').trim(),
      role: String(r.role || 'client').trim().toLowerCase(),
    })).filter(r => r.email || r.password);
    if (!clean.length) { setError('No rows found. Expected columns: email, password, role'); return; }
    setRows(clean);
  };

  const pick = e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => parse(String(reader.result));
    reader.readAsText(f);
  };

  const run = async () => {
    setBusy(true);
    try { const r = await onImport(rows); setResult(r); setRows(null); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return <Modal title="Import Users" onClose={onClose} width={520}>
    <Notice kind="info">{hint || 'Upload a CSV or JSON file with columns: email, password, role (client or admin). Existing emails are skipped.'}</Notice>
    <input type="file" accept=".csv,.json,text/csv,application/json" onChange={pick}
      style={{ width: '100%', fontSize: 13, color: 'var(--muted)', marginBottom: 12, fontFamily: 'inherit' }} />
    {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
    {rows && <Notice kind="info">{rows.length} row(s) ready to import.</Notice>}
    {result && <Notice kind="success">
      Imported {result.created} user(s), skipped {result.skipped} duplicate(s){result.errors?.length ? ', ' + result.errors.length + ' error(s)' : ''}.
    </Notice>}
    {result?.errors?.length ? <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12, maxHeight: 140, overflowY: 'auto' }}>
      {result.errors.map((e, i) => <div key={i} style={{ fontSize: 12, color: 'var(--red)', marginBottom: 4 }}>{e}</div>)}
    </div> : null}
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
      <Button variant="outline" onClick={onClose}>Close</Button>
      {rows && <Button onClick={run} disabled={busy}>{busy ? 'Importing…' : 'Import ' + rows.length + ' row(s)'}</Button>}
    </div>
  </Modal>;
}

/* ---------------- auth + formatting ---------------- */

export function useAuth() {
  const [token, setToken] = useState(localStorage.getItem('otp_token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('otp_user') || 'null'));
  const save = (t, u) => { setToken(t); setUser(u); localStorage.setItem('otp_token', t); localStorage.setItem('otp_user', JSON.stringify(u)); };
  const clear = () => { setToken(''); setUser(null); localStorage.removeItem('otp_token'); localStorage.removeItem('otp_user'); };
  return { token, user, login: save, logout: clear };
}

export function fmtDate(ts) { return ts ? new Date(ts).toLocaleString() : '—'; }
