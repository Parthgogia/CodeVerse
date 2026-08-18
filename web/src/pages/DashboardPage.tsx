import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, Users, Clock, Globe, Lock,
  MoreVertical, Trash2, ExternalLink, Code2, Copy, AlertTriangle,
} from 'lucide-react';
import { roomsApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Navbar } from '../components/layout/Navbar';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import type { Room, Language, CreateRoomInput } from '../types/index';
import { LANGUAGES } from '../types/index';

// ── Language badge color map ──────────────────────────────
const LANG_BADGE: Record<Language, { cls: string }> = {
  javascript: { cls: 'badge-orange' },
  typescript: { cls: 'badge-blue'   },
  python:     { cls: 'badge-green'  },
  cpp:        { cls: 'badge-red'    },
  java:       { cls: 'badge-purple' },
};

// ── Time formatting ───────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Create Room Modal ─────────────────────────────────────
interface CreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (room: Room) => void;
}

function CreateRoomModal({ open, onClose, onCreate }: CreateModalProps) {
  const [name, setName]       = useState('');
  const [desc, setDesc]       = useState('');
  const [lang, setLang]       = useState<Language>('python');
  const [isPublic, setPublic] = useState(true);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => { setName(''); setDesc(''); setLang('python'); setPublic(true); setError(''); };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Room name is required.'); return; }
    setError('');
    setLoading(true);
    try {
      const data: CreateRoomInput = { name: name.trim(), description: desc.trim() || undefined, language: lang, isPublic };
      const room = await roomsApi.create(data);
      onCreate(room);
      handleClose();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create room.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Create room"
      footer={
        <>
          <Button variant="ghost" size="md" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" size="md" loading={loading} onClick={handleSubmit}>
            Create room
          </Button>
        </>
      }
    >
      {error && <div className="auth-error">{error}</div>}

      <Input
        label="Room name"
        placeholder="e.g. Advent of Code 2025"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        maxLength={80}
      />
      <Input
        label="Description (optional)"
        placeholder="What are you building?"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        maxLength={200}
      />

      {/* Language picker */}
      <div>
        <div className="input-label" style={{ marginBottom: 8 }}>Language</div>
        <div className="lang-grid">
          {(Object.entries(LANGUAGES) as [Language, typeof LANGUAGES[Language]][]).map(([key, cfg]) => (
            <button
              key={key}
              className={`lang-btn${lang === key ? ' selected' : ''}`}
              onClick={() => setLang(key)}
              type="button"
            >
              <span className="lang-icon">{cfg.icon}</span>
              {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Visibility */}
      <div>
        <div className="input-label" style={{ marginBottom: 8 }}>Visibility</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { v: true,  label: 'Public',  icon: <Globe size={14} />,  desc: 'Anyone with link' },
            { v: false, label: 'Private', icon: <Lock size={14} />,   desc: 'Only you' },
          ].map(({ v, label, icon, desc }) => (
            <button
              key={label}
              type="button"
              onClick={() => setPublic(v)}
              style={{
                flex: 1, padding: '10px 14px',
                border: `1px solid ${isPublic === v ? 'var(--bd-vivid)' : 'var(--bd-base)'}`,
                background: isPublic === v ? 'rgba(59,130,246,0.1)' : 'var(--bg-input)',
                borderRadius: 'var(--r-md)',
                color: isPublic === v ? 'var(--ac-blue-vivid)' : 'var(--tx-2)',
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                gap: 4, cursor: 'pointer', transition: 'all 200ms',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
                {icon} {label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--tx-3)' }}>{desc}</div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ── Join Room Modal ──────────────────────────────────────
interface JoinModalProps {
  open: boolean;
  onClose: () => void;
}

function JoinRoomModal({ open, onClose }: JoinModalProps) {
  const [code, setCode]   = useState('');
  const [error, setError] = useState('');
  const navigate          = useNavigate();

  const handleClose = () => { setCode(''); setError(''); onClose(); };

  const handleSubmit = () => {
    const val = code.trim();
    if (!val) { setError('Room code is required.'); return; }
    if (!/^[a-zA-Z0-9]{8}$/.test(val)) { setError('Code must be 8 alphanumeric characters.'); return; }
    handleClose();
    navigate(`/room/${val.toUpperCase()}`);
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Join room by code"
      footer={
        <>
          <Button variant="ghost" size="md" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" size="md" onClick={handleSubmit}>
            Join room
          </Button>
        </>
      }
    >
      {error && <div className="auth-error">{error}</div>}
      <Input
        label="Room Code"
        placeholder="Enter 8-character code (e.g. A4F98E72)"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoFocus
        maxLength={8}
      />
    </Modal>
  );
}

// ── Room card ─────────────────────────────────────────────
interface RoomCardProps {
  room: Room;
  isOwner: boolean;
  onDelete: (room: Room) => void;
}

function RoomCard({ room, isOwner, onDelete }: RoomCardProps) {
  const navigate              = useNavigate();
  const toast                 = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef               = useRef<HTMLDivElement>(null);
  const cfg                   = LANGUAGES[room.language];
  const badge                 = LANG_BADGE[room.language];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const copyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(room.id);
    toast.success('Room code copied!');
    setMenuOpen(false);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    onDelete(room);
  };

  return (
    <div className="room-card" onClick={() => navigate(`/room/${room.id}`)}>
      <div className="room-card-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 18 }}>{cfg.icon}</span>
            <div className="room-card-name">{room.name}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span className={`badge ${badge.cls}`}>{cfg.label}</span>
            {!room.isPublic && (
              <span className="badge badge-blue" style={{ gap: 4 }}>
                <Lock size={9} /> Private
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="room-card-actions" onClick={(e) => e.stopPropagation()}>
          {/* Owners get delete as its own button — it used to be buried in the
              menu below, which only appeared on hover. */}
          {isOwner && (
            <button
              className="btn btn-ghost btn-icon room-card-delete"
              title="Delete room"
              aria-label={`Delete ${room.name}`}
              onClick={handleDelete}
            >
              <Trash2 size={15} />
            </button>
          )}

          <div ref={menuRef} className="room-card-menu">
            <button
              className="btn btn-ghost btn-icon"
              title="More actions"
              aria-label="More actions"
              onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
              style={{ color: 'var(--tx-3)' }}
            >
              <MoreVertical size={15} />
            </button>
            {menuOpen && (
              <div className="dropdown">
                <button className="dropdown-item" onClick={(e) => { navigate(`/room/${room.id}`); e.stopPropagation(); }}>
                  <ExternalLink size={13} /> Open room
                </button>
                <button className="dropdown-item" onClick={copyCode}>
                  <Copy size={13} /> Copy room code
                </button>
                {isOwner && (
                  <>
                    <div style={{ height: 1, background: 'var(--bd-dim)', margin: '4px 0' }} />
                    <button className="dropdown-item danger" onClick={handleDelete}>
                      <Trash2 size={13} /> Delete room
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {room.description && (
        <p className="room-card-desc">{room.description}</p>
      )}

      <div className="room-card-footer">
        <div className="room-card-meta">
          {(room.activeUsers ?? 0) > 0 && (
            <div className="room-card-stat" style={{ color: 'var(--ac-green)' }}>
              <div className="live-dot" />
              <Users size={12} />
              {room.activeUsers} live
            </div>
          )}
          <div className="room-card-stat">
            <Clock size={12} />
            {timeAgo(room.updatedAt)}
          </div>
        </div>

        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: room.isPublic ? 'var(--ac-green)' : 'var(--tx-4)',
          boxShadow: room.isPublic ? '0 0 6px var(--ac-green)' : 'none',
        }} title={room.isPublic ? 'Public' : 'Private'} />
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────
export function DashboardPage() {
  const { user }                = useAuth();
  const navigate                = useNavigate();
  const [rooms, setRooms]       = useState<Room[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining]   = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Room | null>(null);
  const [deleting, setDeleting] = useState(false);
  const toast                   = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await roomsApi.list();
      setRooms(data);
    } catch {
      /* handle silently for now */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = (room: Room) => {
    setRooms((prev) => [room, ...prev]);
  };

  const handleDeleteConfirmed = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await roomsApi.delete(pendingDelete.id);
      setRooms((prev) => prev.filter((r) => r.id !== pendingDelete.id));
      toast.success('Room deleted', `"${pendingDelete.name}" and its history are gone.`);
      setPendingDelete(null);
    } catch (err: any) {
      toast.error('Delete failed', err?.message ?? 'Could not delete this room.');
    } finally {
      setDeleting(false);
    }
  };

  // ── Search / join handler ─────────────────────────────
  const handleSearch = useCallback(() => {
    const val = search.trim();
    if (!val) return;

    // Direct room code join: if 8 chars alphanumeric, navigate to the room
    if (/^[a-zA-Z0-9]{8}$/.test(val)) {
      navigate(`/room/${val.toUpperCase()}`);
      return;
    }
  }, [search, navigate]);

  const filtered = rooms.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.description?.toLowerCase().includes(search.toLowerCase())
  );

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="dashboard">
      <Navbar />

      {/* Header */}
      <div className="dashboard-header">
        <div className="dashboard-greeting">{greeting()}</div>
        <div className="dashboard-title">{user?.username}'s workspace</div>

        {/* Search row */}
        <div className="dashboard-actions">
          <div className="dashboard-search">
            <span className="dashboard-search-icon"><Search size={15} /></span>
            <input
              placeholder="Search rooms or enter code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <Button
            variant="primary"
            size="md"
            icon={<Search size={15} />}
            onClick={handleSearch}
          >
            Search
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="dashboard-content">
        <div className="dashboard-section-header">
          <div className="dashboard-section-title">
            <Code2 size={18} />
            Your rooms
            <span className="dashboard-count">{filtered.length}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="secondary"
              size="sm"
              icon={<Users size={15} />}
              onClick={() => setJoining(true)}
            >
              Join by Code
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={15} />}
              onClick={() => setCreating(true)}
            >
              New room
            </Button>
            {rooms.length > 0 && (
              <Button variant="ghost" size="sm" onClick={load}>
                Refresh
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="rooms-grid">
            {[1, 2, 3].map((i) => (
              <div key={i} style={{
                height: 160, borderRadius: 'var(--r-lg)',
                background: 'var(--bg-2)',
                border: '1px solid var(--bd-dim)',
                backgroundImage: 'linear-gradient(90deg, var(--bg-2) 25%, var(--bg-3) 50%, var(--bg-2) 75%)',
                backgroundSize: '300% 100%',
                animation: 'shimmer 1.5s infinite',
              }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rooms-grid">
            <div className="empty-state">
              <div className="empty-icon"><Code2 size={28} /></div>
              <div className="empty-title">
                {search ? 'No rooms match your search' : 'No rooms yet'}
              </div>
              <p className="empty-desc">
                {search
                  ? 'Try a different search term, or enter an 8-character room code.'
                  : 'Create your first room to start collaborating with teammates in real-time.'
                }
              </p>
              {!search && (
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
                  Create first room
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="rooms-grid">
            {filtered.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                isOwner={room.ownerId === user?.id}
                onDelete={setPendingDelete}
              />
            ))}
          </div>
        )}
      </div>

      <CreateRoomModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={handleCreate}
      />
      <JoinRoomModal
        open={joining}
        onClose={() => setJoining(false)}
      />

      <Modal
        open={!!pendingDelete}
        onClose={() => { if (!deleting) setPendingDelete(null); }}
        title="Delete this room?"
        footer={
          <>
            <Button variant="ghost" size="md" onClick={() => setPendingDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              loading={deleting}
              icon={<Trash2 size={14} />}
              onClick={handleDeleteConfirmed}
            >
              Delete room
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{
            flexShrink: 0, width: 34, height: 34, borderRadius: 'var(--r-md)',
            background: 'var(--red-dim)', color: 'var(--red)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertTriangle size={17} />
          </div>
          <div style={{ fontSize: 14, color: 'var(--tx-2)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--tx-1)' }}>{pendingDelete?.name}</strong> and its
            saved code history will be permanently deleted. Anyone still in the room will be
            sent back to their dashboard.
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--tx-3)' }}>
              This can't be undone.
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}