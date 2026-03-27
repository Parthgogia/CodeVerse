import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Zap, Users, Code2, Terminal, Shield, Cpu, ArrowRight} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Plasma } from '../components/ui/Plasma';

// ── Code preview ──────────────────────────────────────────
const CODE_LINES = [
  [{ c:'tk-kw',t:'async function'},{c:'',t:' '},{c:'tk-fn',t:'solve'},{c:'',t:'(graph: '},{c:'tk-type',t:'Graph'},{c:'',t:') {'}],
  [{c:'',t:'  '},{c:'tk-kw',t:'const'},{c:'',t:' dp = '},{c:'tk-kw',t:'new'},{c:'',t:' '},{c:'tk-type',t:'Map'},{c:'',t:'<string, number>();'}],
  [{c:'tk-cm',t:'  // Memoized DFS traversal'}],
  [{c:'',t:'  '},{c:'tk-kw',t:'const'},{c:'',t:' dfs = ('},{c:'tk-var',t:'node'},{c:'',t:': '},{c:'tk-type',t:'string'},{c:'',t:'): '},{c:'tk-type',t:'number'},{c:'',t:' => {'}],
  [{c:'',t:'    '},{c:'tk-kw',t:'if'},{c:'',t:' (dp.'},{c:'tk-fn',t:'has'},{c:'',t:'(node)) '},{c:'tk-kw',t:'return'},{c:'',t:' dp.'},{c:'tk-fn',t:'get'},{c:'',t:'(node)!;'}],
  [{c:'',t:'    '},{c:'tk-kw',t:'const'},{c:'',t:' res = graph[node].'},{c:'tk-fn',t:'reduce'},{c:'',t:'((acc, n) =>'}],
  [{c:'',t:'      '},{c:'tk-fn',t:'Math'},{c:'',t:'.'},{c:'tk-fn',t:'max'},{c:'',t:'(acc, '},{c:'tk-fn',t:'dfs'},{c:'',t:'(n)), '},{c:'tk-num',t:'0'},{c:'',t:');'}],
];

const FAKE_USERS = [
  { name:'Arjun', color:'#4432e2', bg:'rgba(68,19,231,0.15)' },
  { name:'Priya', color:'#10b981', bg:'rgba(16,185,129,0.14)' },
  { name:'Raj',   color:'#f59e0b', bg:'rgba(245,158,11,0.14)' },
];

function CodePreview() {
  return (
    <div className="hero-preview">
      <div className="hero-preview-frame">
        <div className="preview-titlebar">
          <div className="preview-dot" style={{ background:'#ff5f57' }} />
          <div className="preview-dot" style={{ background:'#febc2e' }} />
          <div className="preview-dot" style={{ background:'#28c840' }} />
          <span className="preview-title-text">solve.ts — CodeVerse · Room #42</span>
          <div style={{ marginLeft:'auto', display:'flex', gap:5 }}>
            {FAKE_USERS.map((u) => (
              <div key={u.name} className="preview-user-pill" style={{ background:u.bg, color:u.color, border:`1px solid ${u.color}28` }}>
                <div className="preview-avatar" style={{ background:u.color }}>{u.name[0]}</div>
                {u.name}
              </div>
            ))}
          </div>
        </div>
        <div className="preview-body">
          <div className="preview-sidebar">
            {['📁 src','  🔷 solve.ts','  🟨 index.js','  🐍 helper.py','📄 README.md'].map((item, i) => (
              <div key={i} className={`preview-sidebar-item${i===1?' active':''}`}>{item}</div>
            ))}
          </div>
          <div className="preview-code">
            {CODE_LINES.map((line, li) => (
              <div key={li} style={{ display:'flex', gap:14 }}>
                <span style={{ color:'var(--tx-4)', userSelect:'none', minWidth:18, textAlign:'right', fontSize:11.5 }}>{li+1}</span>
                <span>
                  {line.map((tok, ti) => <span key={ti} className={tok.c}>{tok.t}</span>)}
                  {li === CODE_LINES.length-1 && <span className="tk-cursor" />}
                </span>
              </div>
            ))}
            {/* Remote cursors */}
            <div style={{ position:'absolute', top:58, left:152, width:2, height:'1.3em', background:'#10b981', boxShadow:'0 0 6px #10b981', borderRadius:1 }} />
            <div style={{ position:'absolute', top:96, left:210, width:2, height:'1.3em', background:'#f59e0b', boxShadow:'0 0 6px #f59e0b', borderRadius:1 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Features ──────────────────────────────────────────────
const FEATURES = [
  { icon:<Users size={18}/>, bg:'rgba(68,19,231,0.12)', color:'var(--ac-6)',  title:'Live Collaboration', desc:'Real-time CRDT sync via Yjs — see every keystroke as it happens. Live cursors show exactly where teammates are.' },
  { icon:<Terminal size={18}/>, bg:'rgba(16,185,129,0.10)', color:'var(--green)', title:'Docker Sandbox', desc:'Each run gets an isolated Docker container with CPU, memory, and time limits. Safe, reproducible, fast.' },
  { icon:<Code2 size={18}/>, bg:'rgba(245,158,11,0.10)', color:'var(--amber)', title:'Multi-Language', desc:'JavaScript, TypeScript, Python, C++, Java — powered by language-specific runtime images with full standard libraries.' },
  { icon:<Cpu size={18}/>, bg:'rgba(139,92,246,0.10)', color:'var(--vc-4)', title:'Auto-scaled Workers', desc:'BullMQ job queue with Redis. Workers scale horizontally — your code runs even under heavy load.' },
  { icon:<Shield size={18}/>, bg:'rgba(34,211,238,0.08)', color:'var(--cyan)', title:'Rate Limiting', desc:'Atomic Redis rate limiting with INCR + EXPIRE. Fair usage enforced at the API level.' },
  { icon:<Zap size={18}/>, bg:'rgba(68,19,231,0.10)', color:'var(--ac-5)', title:'Persistent Rooms', desc:'Rooms and documents live in PostgreSQL. Come back days later — your code is exactly where you left it.' },
];

// ── Main ──────────────────────────────────────────────────
export function LandingPage() {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => {
      if (navRef.current) navRef.current.classList.toggle('scrolled', window.scrollY > 8);
    };
    window.addEventListener('scroll', onScroll, { passive:true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="landing">
      {/* ── Navbar ── */}
      <nav ref={navRef} className="navbar">
        <div className="navbar-logo">
          <div className="navbar-logo-icon"><Zap size={14} color="#fff" strokeWidth={2.5} /></div>
          CodeVerse
        </div>
        <div className="navbar-links">
          <a href="#features" className="navbar-link">Features</a>
          <a href="#how" className="navbar-link">How it works</a>
        </div>
        <div className="navbar-right">
          <Link to="/auth"><Button variant="ghost" size="sm">Sign in</Button></Link>
          <Link to="/auth?tab=register"><Button variant="primary" size="sm">Get started</Button></Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero">
        {/* Plasma background */}
        <div className="plasma-bg interactive" style={{ pointerEvents:'auto' }}>
          <Plasma
            speed={1.6}
            color="4413e7"
            opacity={0.5}
            mouseInteractive={true}
            scale={1.2}
            direction="pingpong"
          />
        </div>

        {/* Dark vignette over plasma so text stays readable */}
        <div style={{
          position:'absolute', inset:0, zIndex:0,
          background:'radial-gradient(ellipse at 50% 50%, rgba(6,6,15,0.35) 0%, rgba(6,6,15,0.82) 75%)',
          pointerEvents:'none',
        }} />

        {/* Subtle grid */}
        <div style={{
          position:'absolute', inset:0, zIndex:0, pointerEvents:'none',
          backgroundImage:'linear-gradient(rgba(68,19,231,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(68,19,231,0.035) 1px,transparent 1px)',
          backgroundSize:'56px 56px',
        }} />

        <div className="hero-content">
          <div className="hero-eyebrow">
            <span className="hero-eyebrow-dot" />
            Real-time collaborative code editor
          </div>

          <h1 className="hero-title">
            Code together,<br />
            <em className="gradient-text">ship faster.</em>
          </h1>

          <p className="hero-sub">
            A multiplayer IDE with live cursors, CRDT sync, Docker-sandboxed execution,
            and auto-scaled workers — all running in the browser.
          </p>

          <div className="hero-cta">
            <Link to="/auth?tab=register">
              <Button size="lg" variant="primary" icon={<Zap size={15} />}>Start coding free</Button>
            </Link>
            <Link to="/auth">
              <Button size="lg" variant="secondary" icon={<ArrowRight size={15} />}>Sign in</Button>
            </Link>
          </div>

          <CodePreview />
        </div>
      </section>

      {/* ── Features ── */}
      <section className="section" id="features" style={{ background:'var(--bg-1)', position:'relative' }}>
        {/* Subtle plasma bleed from hero */}
        <div style={{ position:'absolute', top:0, left:0, right:0, height:1, background:'linear-gradient(90deg,transparent,var(--bd-2),transparent)' }} />
        <div className="section-inner">
          <div className="section-header">
            <span className="section-label">Capabilities</span>
            <h2 className="section-title">Everything you need to<br /><em>collaborate at scale</em></h2>
            <p className="section-desc">From CRDT-powered real-time sync to Docker sandboxed execution — built for serious collaborative development.</p>
          </div>
          <div className="features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="feature-card">
                <div className="feature-icon" style={{ background:f.bg, color:f.color }}>{f.icon}</div>
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
            <h2 className="section-title">From room to result<br /><em>in seconds</em></h2>
          </div>
          <div className="steps-grid">
            {[
              { n:'01', title:'Create a room', desc:'Choose your language, name your room, and get a shareable link. Invite teammates by sharing the URL — no setup required.' },
              { n:'02', title:'Code together', desc:'Every edit syncs in real-time using Yjs CRDT. See live cursors, presence indicators, and concurrent edits merge automatically.' },
              { n:'03', title:'Run & iterate', desc:'Hit Run and your code enters the BullMQ queue. A Docker worker executes it in an isolated container and streams output back.' },
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
        {/* Small plasma behind CTA card */}
        <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
          <Plasma speed={0.8} color="4413e7" opacity={0.22} mouseInteractive={false} scale={1.5} direction="pingpong" />
          <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 50%, transparent 20%, var(--bg-0) 70%)' }} />
        </div>

        <div className="cta-card" style={{ position:'relative', zIndex:1 }}>
          <h2 className="cta-title">
            Ready to build<br />
            <em className="gradient-text">something together?</em>
          </h2>
          <p className="cta-desc">Join developers who collaborate in real-time with CodeVerse.</p>
          <Link to="/auth?tab=register">
            <Button size="xl" variant="primary" icon={<Zap size={17} />}>Create your first room</Button>
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="navbar-logo" style={{ fontSize:14 }}>
          <div className="navbar-logo-icon" style={{ width:22, height:22 }}><Zap size={11} color="#fff" strokeWidth={2.5} /></div>
          CodeVerse
        </div>
        <div className="footer-copy">© 2026 CodeVerse. Open source.</div>
        <div className="footer-links">
          <a href="#" className="footer-link">Privacy</a>
          <a href="#" className="footer-link">Terms</a>
        </div>
      </footer>
    </div>
  );
}
