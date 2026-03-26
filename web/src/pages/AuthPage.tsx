import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, ArrowLeft, Zap, Eye, EyeOff } from 'lucide-react';
import { Plasma } from '../components/ui/Plasma';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

// ── Floating code cards in left panel ────────────────────
function FloatingCards() {
  return (
    <div className="auth-float-cards">
      <div className="auth-float-card" style={{ top: 0, left: 0, transform: 'rotate(-4deg)' }}>
        <div className="tk-cm">{`// Yjs CRDT sync`}</div>
        <div>
          <span className="tk-kw">const</span>{' '}
          <span className="tk-var">doc</span>{' = '}
          <span className="tk-kw">new</span>{' '}
          <span className="tk-fn">Y.Doc</span>
          {'();'}
        </div>
        <div>
          <span className="tk-var">doc</span>
          {'.'}
          <span className="tk-fn">on</span>
          {'('}
          <span className="tk-str">'update'</span>
          {', sync)'}
        </div>
      </div>
      <div className="auth-float-card" style={{ top: 80, right: 0, transform: 'rotate(3deg)' }}>
        <div className="tk-cm">{`# Python runtime`}</div>
        <div>
          <span className="tk-kw">def</span>{' '}
          <span className="tk-fn">fibonacci</span>
          {'(n: '}
          <span className="tk-type">int</span>
          {') →'}
        </div>
        <div style={{ paddingLeft: 16 }}>
          <span className="tk-kw">int</span>
          {': ...'}
        </div>
      </div>
      <div className="auth-float-card" style={{ bottom: 0, left: 30, transform: 'rotate(-1deg)' }}>
        <div>
          <span className="tk-cm">{`// Live cursors`}</span>
        </div>
        <div>
          <span className="tk-var">socket</span>
          {'.'}
          <span className="tk-fn">emit</span>
          {'('}
          <span className="tk-str">'cursor:move'</span>
          {','}
        </div>
        <div style={{ paddingLeft: 16 }}>
          {'{ line: '}
          <span className="tk-num">42</span>
          {', col: '}
          <span className="tk-num">8</span>
          {' })'}
        </div>
      </div>
    </div>
  );
}

// ── Auth forms ────────────────────────────────────────────
interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  onSwitch: () => void;
}

function LoginForm({ onSubmit, onSwitch }: LoginFormProps) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setError('');
    setLoading(true);
    try {
      await onSubmit(email, password);
    } catch (err: any) {
      setError(err?.message ?? 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div>
        <h1 className="auth-form-title">Welcome back</h1>
        <p className="auth-form-sub">Sign in to continue to your rooms</p>
      </div>
      {error && <div className="auth-error">{error}</div>}
      <Input
        label="Email"
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        icon={<Mail size={15} />}
        autoComplete="email"
        required
      />
      <div className="input-group">
        <label className="input-label">Password</label>
        <div className="input-wrap">
          <span className="input-icon"><Lock size={15} /></span>
          <input
            className="input has-icon"
            type={showPw ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            style={{ paddingRight: 44 }}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--tx-3)', display: 'flex', transition: 'color 150ms',
            }}
          >
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>
      <Button type="submit" variant="primary" size="lg" loading={loading} style={{ width: '100%', marginTop: 4 }}>
        Sign in
      </Button>
      <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--tx-3)' }}>
        Don't have an account?{' '}
        <button
          type="button"
          onClick={onSwitch}
          style={{ background: 'none', border: 'none', color: 'var(--ac-blue-vivid)', cursor: 'pointer', fontSize: 13 }}
        >
          Create one
        </button>
      </p>
    </form>
  );
}

interface RegisterFormProps {
  onSubmit: (username: string, email: string, password: string) => Promise<void>;
  onSwitch: () => void;
}

function RegisterForm({ onSubmit, onSwitch }: RegisterFormProps) {
  const [username, setUsername] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !email || !password) { setError('Please fill in all fields.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setError('');
    setLoading(true);
    try {
      await onSubmit(username, email, password);
    } catch (err: any) {
      setError(err?.message ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div>
        <h1 className="auth-form-title">Create account</h1>
        <p className="auth-form-sub">Join thousands of developers coding together</p>
      </div>
      {error && <div className="auth-error">{error}</div>}
      <Input
        label="Username"
        type="text"
        placeholder="your_username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        icon={<User size={15} />}
        autoComplete="username"
        required
      />
      <Input
        label="Email"
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        icon={<Mail size={15} />}
        autoComplete="email"
        required
      />
      <div className="input-group">
        <label className="input-label">Password</label>
        <div className="input-wrap">
          <span className="input-icon"><Lock size={15} /></span>
          <input
            className="input has-icon"
            type={showPw ? 'text' : 'password'}
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            style={{ paddingRight: 44 }}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--tx-3)', display: 'flex',
            }}
          >
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>

      {/* Password strength */}
      {password && (
        <div style={{ display: 'flex', gap: 4 }}>
          {[1,2,3,4].map((i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: password.length >= i * 3
                ? i <= 1 ? 'var(--ac-red)'
                : i <= 2 ? 'var(--ac-orange)'
                : i <= 3 ? 'var(--ac-blue-bright)'
                : 'var(--ac-green)'
                : 'var(--bd-base)',
              transition: 'background 200ms',
            }} />
          ))}
        </div>
      )}

      <Button type="submit" variant="primary" size="lg" loading={loading} style={{ width: '100%', marginTop: 4 }}>
        Create account
      </Button>
      <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--tx-3)' }}>
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitch}
          style={{ background: 'none', border: 'none', color: 'var(--ac-blue-vivid)', cursor: 'pointer', fontSize: 13 }}
        >
          Sign in
        </button>
      </p>
    </form>
  );
}

// ── Main Page ─────────────────────────────────────────────
export function AuthPage() {
  const { login, register, isAuthenticated } = useAuth();
  const navigate         = useNavigate();
  const [params]         = useSearchParams();
  const [tab, setTab]    = useState<'login' | 'register'>(
    params.get('tab') === 'register' ? 'register' : 'login'
  );

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  const handleLogin = async (email: string, password: string) => {
    await login(email, password);
    navigate('/dashboard');
  };

  const handleRegister = async (username: string, email: string, password: string) => {
    await register(username, email, password);
    navigate('/dashboard');
  };

  return (
    <div className="auth-page">
      {/* ── Left panel ── */}
      <div className="auth-panel">
        {/* Plasma background on left panel */}
        <div style={{ position:'absolute', inset:0 }}>
          <Plasma speed={1.2} color="4413e7" opacity={0.42} mouseInteractive={false} scale={1.1} direction="pingpong" />
          <div style={{ position:'absolute', inset:0, background:'rgba(6,6,15,0.60)' }} />
        </div>

        <div className="auth-panel-content" style={{ position: 'relative', zIndex: 1 }}>
          <div className="navbar-logo" style={{ justifyContent: 'center', marginBottom: 24, fontSize: 22 }}>
            <div className="navbar-logo-icon" style={{ width: 36, height: 36 }}>
              <Zap size={18} color="#fff" strokeWidth={2.5} />
            </div>
            CodeSync
          </div>
          <h2 className="auth-panel-title">
            Real-time code<br />
            <em className="gradient-text">collaboration</em>
          </h2>
          <p className="auth-panel-desc">
            Write, run, and debug code together with live cursors, CRDT sync, and Docker-sandboxed execution.
          </p>
          <FloatingCards />

          {/* Stats */}
          <div style={{ display: 'flex', gap: 32, justifyContent: 'center', marginTop: 40 }}>
            {[
              { val: '5+', label: 'Languages' },
              { val: '<100ms', label: 'Sync latency' },
              { val: '∞', label: 'Collaborators' },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--ac-blue-vivid)' }}>
                  {s.val}
                </div>
                <div style={{ fontSize: 11, color: 'var(--tx-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right / form side ── */}
      <div className="auth-form-side">
        <Link to="/" className="auth-back">
          <ArrowLeft size={14} /> Back to home
        </Link>

        <div className="auth-form-box">
          {/* Tab switcher */}
          <div className="auth-tabs">
            <button
              className={`auth-tab${tab === 'login' ? ' active' : ''}`}
              onClick={() => setTab('login')}
            >
              Sign in
            </button>
            <button
              className={`auth-tab${tab === 'register' ? ' active' : ''}`}
              onClick={() => setTab('register')}
            >
              Create account
            </button>
          </div>

          {tab === 'login'
            ? <LoginForm    onSubmit={handleLogin}    onSwitch={() => setTab('register')} />
            : <RegisterForm onSubmit={handleRegister} onSwitch={() => setTab('login')}    />
          }
        </div>
      </div>
    </div>
  );
}
