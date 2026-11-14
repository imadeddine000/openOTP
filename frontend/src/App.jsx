import { HashRouter, Routes, Route, Link } from 'react-router-dom';
import AdminApp from './admin/AdminApp.jsx';
import ClientApp from './client/ClientApp.jsx';

const FEATURES = [
  { icon: '⚡', title: 'One-Endpoint Sending', text: 'POST to /api/v1/messages with a recipient and a body. Every message is auto-routed to the best available gateway — you never think about infrastructure.' },
  { icon: '📡', title: 'Real-Time Delivery Tracking', text: 'Each message carries a live status — pending, sent, delivered, or failed with error codes — updated in your dashboard the moment it happens.' },
  { icon: '📦', title: 'Bulk & Batch Sending', text: 'One recipient or ten thousand. Batches are tracked individually, so you always know exactly who received what.' },
  { icon: '🔄', title: 'Smart SIM Routing', text: 'Round-robin across SIMs, pinned to a specific card, or overridden per request. Built for high-volume OTP traffic.' },
  { icon: '🔑', title: 'Rotatable API Keys', text: 'Create multiple labeled keys per project and revoke them instantly. Never share a secret across environments again.' },
  { icon: '📥', title: 'Two-Way Messaging', text: 'Replies and incoming SMS are forwarded to your account and deduplicated automatically — perfect for verification flows.' },
];

const STEPS = [
  { title: 'Create your account', text: 'Sign up in the Client Portal in seconds. No credit card, no sales call — just a working SMS gateway.' },
  { title: 'Generate an API key', text: 'Create a labeled key for your app or backend. Rotate or revoke it anytime, without downtime.' },
  { title: 'Send & track', text: 'Fire your first request and watch delivery status update live in your dashboard.' },
];

function Landing() {
  return <div className="landing">
    <nav className="lnav">
      <span className="logo">open<b style={{ color: 'var(--accent)' }}>OTP</b></span>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <a href="/client-api.html" style={{ color: 'var(--muted)', fontSize: 14, fontWeight: 600 }}>API Docs</a>
        <Link to="/client"><button className="btn-ghost" style={{ padding: '9px 18px', fontSize: 13.5 }}>Client Portal</button></Link>
      </div>
    </nav>

    <section className="lhero">
      <span className="pill">SMS Gateway API</span>
      <h1>Send OTP &amp; SMS anywhere<br />with <span className="grad-text">one API call</span></h1>
      <p className="sub">openOTP is the SMS gateway built for developers. Grab an API key, POST to a single endpoint, and follow every message from queued to delivered — no telecom contracts, no hardware to babysit.</p>
      <div className="cta-row">
        <Link to="/client"><button className="btn-cta">Start Sending Free →</button></Link>
        <a href="/client-api.html"><button className="btn-ghost">Read the API Docs</button></a>
      </div>
      <div className="codecard">
        <div className="head">
          <span className="dot" style={{ background: '#ef4444' }} />
          <span className="dot" style={{ background: '#fbbf24' }} />
          <span className="dot" style={{ background: '#22c55e' }} />
          <span className="fname">send-otp.sh</span>
        </div>
        <pre>
<span className="cmt"># grab your API key from the Client Portal, then:</span>{'\n'}
<span className="k">curl</span> -X POST https://your-domain.com/api/v1/messages \{'\n'}
  -H <span className="str">"x-api-key: sk_your_api_key"</span> \{'\n'}
  -H <span className="str">"Content-Type: application/json"</span> \{'\n'}
  -d <span className="str">'{'{"to":"+15551234567","message":"Your code is 4821"}'}'</span>{'\n\n'}
<span className="cmt"># response — track delivery live in your dashboard</span>{'\n'}
{'{"data": {"id": "9f2c61a…", "status": "pending", "to": "+15551234567"}}'}
        </pre>
      </div>
    </section>

    <section className="lsection">
      <h2>Everything you need to ship SMS</h2>
      <p className="sub">A complete gateway platform behind a dead-simple REST API.</p>
      <div className="feat-grid">
        {FEATURES.map(f => <div className="feat" key={f.title}>
          <div className="ic">{f.icon}</div>
          <h3>{f.title}</h3>
          <p>{f.text}</p>
        </div>)}
      </div>
    </section>

    <section className="lsection" style={{ paddingTop: 0 }}>
      <h2>Live in three steps</h2>
      <p className="sub">From sign-up to first message in under two minutes.</p>
      <div className="steps">
        {STEPS.map((s, i) => <div className="step" key={s.title}>
          <div className="num">{i + 1}</div>
          <h3>{s.title}</h3>
          <p>{s.text}</p>
        </div>)}
      </div>
    </section>

    <div className="cta-banner">
      <h2>Ready to send your first OTP?</h2>
      <p>Create a free account, generate an API key, and send your first message right away.</p>
      <Link to="/client"><button className="btn-cta">Open the Client Portal →</button></Link>
    </div>

    <footer className="lfooter">
      <span>© {new Date().getFullYear()} openOTP — SMS Gateway SaaS</span>
      <span className="links">
        <a href="/client-api.html">API Docs</a>
        <Link to="/client">Client Portal</Link>
        <Link to="/admin" style={{ color: 'var(--muted)', fontSize: 12 }}>Admin</Link>
      </span>
    </footer>
  </div>;
}

export default function App() {
  return <HashRouter>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/admin/*" element={<AdminApp />} />
      <Route path="/client/*" element={<ClientApp />} />
    </Routes>
  </HashRouter>;
}
