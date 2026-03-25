import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Zap, Users, Code2, Terminal, Shield, Cpu,
  ArrowRight, GitBranch, X
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import Plasma from '../components/ui/Plasma';

// ── Typing animation for code preview ────────────────────
const CODE_LINES = [
  { tokens: [{ cls: 'tk-kw', t: 'async function' }, { cls: '', t: ' ' }, { cls: 'tk-fn', t: 'solve' }, { cls: '', t: '(graph: ' }, { cls: 'tk-type', t: 'Graph' }, { cls: '', t: ') {' }] },
  { tokens: [{ cls: '', t: '  ' }, { cls: 'tk-kw', t: 'const' }, { cls: '', t: ' dp = ' }, { cls: 'tk-kw', t: 'new' }, { cls: '', t: ' ' }, { cls: 'tk-type', t: 'Map' }, { cls: '', t: '<' }, { cls: 'tk-type', t: 'string' }, { cls: '', t: ', ' }, { cls: 'tk-type', t: 'number' }, { cls: '', t: '>();' }] },
  { tokens: [{ cls: 'tk-cm', t: '  // Memoized DFS traversal' }] },
  { tokens: [{ cls: '', t: '  ' }, { cls: 'tk-kw', t: 'const' }, { cls: '', t: ' dfs = (' }, { cls: 'tk-var', t: 'node' }, { cls: '', t: ': ' }, { cls: 'tk-type', t: 'string' }, { cls: '', t: '): ' }, { cls: 'tk-type', t: 'number' }, { cls: '', t: ' => {' }] },
  { tokens: [{ cls: '', t: '    ' }, { cls: 'tk-kw', t: 'if' }, { cls: '', t: ' (dp.' }, { cls: 'tk-fn', t: 'has' }, { cls: '', t: '(node)) ' }, { cls: 'tk-kw', t: 'return' }, { cls: '', t: ' dp.' }, { cls: 'tk-fn', t: 'get' }, { cls: '', t: '(node)!;' }] },
  { tokens: [{ cls: '', t: '    ' }, { cls: 'tk-kw', t: 'const' }, { cls: '', t: ' result = graph[node].' }, { cls: 'tk-fn', t: 'reduce' }, { cls: '', t: '((' }, { cls: 'tk-var', t: 'acc' }, { cls: '', t: ', ' }, { cls: 'tk-var', t: 'n' }, { cls: '', t: ') =>' }] },
  { tokens: [{ cls: '', t: '      ' }, { cls: 'tk-fn', t: 'Math' }, { cls: '', t: '.' }, { cls: 'tk-fn', t: 'max' }, { cls: '', t: '(' }, { cls: 'tk-var', t: 'acc' }, { cls: '', t: ', ' }, { cls: 'tk-fn', t: 'dfs' }, { cls: '', t: '(' }, { cls: 'tk-var', t: 'n' }, { cls: '', t: ')), ' }, { cls: 'tk-num', t: '0' }, { cls: '', t: ');' }] },
];

const FAKE_USERS = [
  { name: 'Arjun', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  { name: 'Priya', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  { name: 'Raj',   color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
];

function CodePreview() {
  return (
    <div className="hero-preview">
      <div className="hero-preview-frame">
        {/* Title bar */}
        <div className="preview-titlebar">
          <div className="preview-dot" style={{ background: '#ff5f57' }} />
          <div className="preview-dot" style={{ background: '#febc2e' }} />
          <div className="preview-dot" style={{ background: '#28c840' }} />
          <span className="preview-title-text">solve.ts — CodeVerse Room #42</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {FAKE_USERS.map((u) => (
              <div
                key={u.name}
                className="preview-user-pill"
                style={{ background: u.bg, color: u.color, border: `1px solid ${u.color}30` }}
              >
                <div
                  className="preview-avatar"
                  style={{ background: u.color }}
                >
                  {u.name[0]}
                </div>
                {u.name}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="preview-body">
          {/* Sidebar */}
          <div className="preview-sidebar">
            {['📁 src', '  🔷 solve.ts', '  🟨 index.js', '  🐍 helper.py', '📄 README.md'].map((item, i) => (
              <div key={i} className={`preview-sidebar-item${i === 1 ? ' active' : ''}`}>
                {item}
              </div>
            ))}
          </div>

          {/* Code */}
          <div className="preview-code">
            {/* Line numbers + code */}
            {CODE_LINES.map((line, li) => (
              <div key={li} style={{ display: 'flex', gap: 16 }}>
                <span style={{ color: 'var(--tx-4)', userSelect: 'none', minWidth: 20, textAlign: 'right', fontSize: 12 }}>
                  {li + 1}
                </span>
                <span>
                  {line.tokens.map((tok, ti) => (
                    <span key={ti} className={tok.cls}>{tok.t}</span>
                  ))}
                  {/* Cursor on last line */}
                  {li === CODE_LINES.length - 1 && <span className="tk-cursor" />}
                </span>
              </div>
            ))}

            {/* Fake colored cursors */}
            <div style={{
              position: 'absolute', top: 58, left: 160,
              width: 2, height: '1.4em',
              background: '#10b981',
              boxShadow: '0 0 6px #10b981',
              borderRadius: 1,
            }} />
            <div style={{
              position: 'absolute', top: 98, left: 220,
              width: 2, height: '1.4em',
              background: '#f59e0b',
              boxShadow: '0 0 6px #f59e0b',
              borderRadius: 1,
            }} />
          </div>
        </div>
      </div>

      {/* Reflection */}
      <div style={{
        height: 60,
        background: 'linear-gradient(to bottom, rgba(9,21,41,0.4), transparent)',
        borderRadius: '0 0 var(--r-xl) var(--r-xl)',
        marginTop: -2,
        filter: 'blur(2px)',
        opacity: 0.4,
      }} />
    </div>
  );
}

// ── Feature cards ─────────────────────────────────────────
const FEATURES = [
  {
    icon: <Users size={20} />,
    iconBg: 'rgba(59,130,246,0.12)',
    iconColor: '#60a5fa',
    title: 'Live Collaboration',
    desc: 'Real-time CRDT sync via Yjs — see every keystroke as it happens. Live cursors show exactly where your teammates are editing.',
  },
  {
    icon: <Terminal size={20} />,
    iconBg: 'rgba(16,185,129,0.12)',
    iconColor: '#34d399',
    title: 'Docker Sandbox',
    desc: 'Each run gets its own isolated Docker container with CPU, memory, and time limits. Safe, reproducible, and fast.',
  },
  {
    icon: <Code2 size={20} />,
    iconBg: 'rgba(245,158,11,0.12)',
    iconColor: '#fbbf24',
    title: 'Multi-Language',
    desc: 'JavaScript, TypeScript, Python, C++, Java — powered by language-specific runtime images with full standard libraries.',
  },
  {
    icon: <Cpu size={20} />,
    iconBg: 'rgba(139,92,246,0.12)',
    iconColor: '#a78bfa',
    title: 'Auto-scaled Workers',
    desc: 'BullMQ-powered job queue with Redis. Workers scale horizontally. Your code runs even under heavy load.',
  },
  {
    icon: <Shield size={20} />,
    iconBg: 'rgba(6,182,212,0.12)',
    iconColor: '#22d3ee',
    title: 'Rate Limiting',
    desc: 'Atomic Redis rate limiting with INCR + EXPIRE. Fair usage enforced at the API level — no one hogs the workers.',
  },
  {
    icon: <Zap size={20} />,
    iconBg: 'rgba(59,130,246,0.12)',
    iconColor: '#3b82f6',
    title: 'Persistent Rooms',
    desc: 'Rooms and documents live in PostgreSQL. Come back days later — your code is exactly where you left it.',
  },
];

// ── Main Component ────────────────────────────────────────
export function LandingPage() {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => {
      if (navRef.current) {
        navRef.current.style.borderBottomColor =
          window.scrollY > 8 ? 'var(--bd-base)' : 'var(--bd-dim)';
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="landing">
      {/* ── Navbar ── */}
      <nav ref={navRef} className="navbar" style={{ position: 'fixed' }}>
        <div className="navbar-logo">
          <div className="navbar-logo-icon">
            <Zap size={15} color="#fff" strokeWidth={2.5} />
          </div>
          CodeVerse
        </div>
        <div className="navbar-links">
          <a href="#features" className="navbar-link">Features</a>
          <a href="#how" className="navbar-link">How it works</a>
        </div>
        <div className="navbar-right">
          <Link to="/auth">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <Link to="/auth?tab=register">
            <Button variant="primary" size="sm">Get started free</Button>
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero">
        <div style={{ width: '100%', height: '100vh', position: 'absolute', top: 0, left: 0, zIndex: 0 }}>
          <Plasma 
            color="#ff6b35"
            speed={0.6}
            direction="forward"
            scale={1.1}
            opacity={0.8}
            mouseInteractive={true}
          />
        </div>

        <div className="hero-content">
          <div className="hero-eyebrow">
            <span className="hero-eyebrow-dot" />
            Real-time collaborative code editor
          </div>

          <h1 className="hero-title">
            Code together.{' '}
            <span className="hero-title-accent">Ship faster.</span>
          </h1>

          <p className="hero-sub">
            A multiplayer code editor with live cursors, CRDT sync, Docker sandboxed execution, 
            and auto-scaled workers — all in the browser.
          </p>

          <div className="hero-cta">
            <Link to="/auth?tab=register">
              <Button size="lg" variant="primary" icon={<Zap size={16} />}>
                Start coding free
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="lg" variant="secondary" icon={<ArrowRight size={16} />}>
                Sign in
              </Button>
            </Link>
          </div>

          <CodePreview />
        </div>
      </section>

      {/* ── Features ── */}
      <section className="section" id="features" style={{ background: 'var(--bg-1)' }}>
        <div className="section-inner">
          <div className="section-header">
            <span className="section-label">Capabilities</span>
            <h2 className="section-title">Everything you need to<br />collaborate at scale</h2>
            <p className="section-desc">
              From CRDT-powered real-time sync to Docker sandboxed execution — built for serious collaborative development.
            </p>
          </div>
          <div className="features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="feature-card">
                <div className="feature-icon" style={{ background: f.iconBg, color: f.iconColor }}>
                  {f.icon}
                </div>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="section" id="how">
        <div className="section-inner">
          <div className="section-header">
            <span className="section-label">Workflow</span>
            <h2 className="section-title">From room to result<br />in seconds</h2>
          </div>
          <div className="steps-grid">
            {[
              {
                n: '01',
                title: 'Create a room',
                desc: 'Choose your language, name your room, and get a shareable link. Invite teammates by sharing the URL — no account required to join.',
              },
              {
                n: '02',
                title: 'Code together',
                desc: 'Every edit syncs in real-time using Yjs CRDT. See live cursors, presence indicators, and concurrent edits merge automatically — no conflicts.',
              },
              {
                n: '03',
                title: 'Run & iterate',
                desc: 'Hit Run and your code enters the BullMQ queue. A Docker worker executes it in an isolated container and streams output back to everyone in the room.',
              },
            ].map((step) => (
              <div key={step.n} className="step-card">
                <div className="step-number">{step.n}</div>
                <h3 className="step-title">{step.title}</h3>
                <p className="step-desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="cta-section">
        <div className="orb" style={{
          width: 400, height: 400,
          background: 'radial-gradient(circle, rgba(37,99,235,0.4) 0%, transparent 70%)',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          opacity: 0.3,
        }} />
        <div className="cta-card">
          <div className="orb" style={{
            width: 300, height: 300,
            background: 'radial-gradient(circle, rgba(59,130,246,0.2) 0%, transparent 70%)',
            top: -100, right: -50,
            opacity: 0.6,
          }} />
          <h2 className="cta-title">
            Ready to build<br />
            <span className="gradient-text">something together?</span>
          </h2>
          <p className="cta-desc">
            Join thousands of developers who collaborate in real-time with CodeVerse.
          </p>
          <Link to="/auth?tab=register">
            <Button size="xl" variant="primary" icon={<Zap size={18} />}>
              Create your first room
            </Button>
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="navbar-logo" style={{ fontSize: 15 }}>
          <div className="navbar-logo-icon" style={{ width: 24, height: 24 }}>
            <Zap size={12} color="#fff" strokeWidth={2.5} />
          </div>
          CodeVerse
        </div>
        <div className="footer-copy">© 2026 CodeVerse. Open source.</div>
        <div className="footer-links">
          <a href="#" className="footer-link">Privacy</a>
          <a href="#" className="footer-link">Terms</a>
          <a href="https://github.com" className="footer-link" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <GitBranch size={14} /> GitHub
          </a>
          <a href="https://twitter.com" className="footer-link" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <X size={14} /> Twitter
          </a>
        </div>
      </footer>
    </div>
  );
}