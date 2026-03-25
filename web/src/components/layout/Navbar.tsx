import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Zap, LogOut, User, Settings, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export function Navbar() {
  const { user, logout }     = useAuth();
  const location             = useLocation();
  const navigate             = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef              = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const initials = user?.username?.slice(0, 2).toUpperCase() ?? '??';
  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <nav className={`navbar${scrolled ? ' scrolled' : ''}`}>
      {/* Logo */}
      <Link to="/dashboard" className="navbar-logo">
        <div className="navbar-logo-icon">
          <Zap size={15} color="#fff" strokeWidth={2.5} />
        </div>
        CodeVerse
      </Link>

      {/* Nav links */}
      <div className="navbar-links">
        <Link to="/dashboard" className={`navbar-link${isActive('/dashboard') ? ' active' : ''}`}>
          Rooms
        </Link>
      </div>

      {/* Right side */}
      <div className="navbar-right">
        {user && (
          <div ref={dropRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setDropOpen((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'none', border: 'none', cursor: 'pointer',
              }}
            >
              <div className="navbar-avatar">{initials}</div>
              <span style={{ fontSize: 13, color: 'var(--tx-2)' }}>{user.username}</span>
              <ChevronDown size={13} color="var(--tx-3)" />
            </button>

            {dropOpen && (
              <div className="dropdown" style={{ right: 0, top: 'calc(100% + 10px)', minWidth: 180 }}>
                <div style={{ padding: '8px 12px 6px', borderBottom: '1px solid var(--bd-dim)', marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-1)' }}>{user.username}</div>
                  <div style={{ fontSize: 11, color: 'var(--tx-3)', marginTop: 1 }}>{user.email}</div>
                </div>
                <button className="dropdown-item">
                  <User size={14} /> Profile
                </button>
                <button className="dropdown-item">
                  <Settings size={14} /> Settings
                </button>
                <div style={{ height: 1, background: 'var(--bd-dim)', margin: '4px 0' }} />
                <button className="dropdown-item danger" onClick={handleLogout}>
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}