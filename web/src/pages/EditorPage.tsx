import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MonacoEditor, { loader } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import {
  Play, Share2, Copy, ChevronDown, ArrowLeft,
  X, Terminal, Users, Info, Loader2, Globe, Lock,
} from 'lucide-react';
import { roomsApi, execApi } from '../lib/api';
import { connectSocket, disconnectSocket, SocketEvents } from '../lib/socket';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useYjsEditor } from '../lib/useYjsEditor';
import { useJobPoller } from '../lib/useJobPoller';
import { registerMonacoTheme } from '../lib/monacoTheme';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import type { Room, Language, OutputLine, ConnectedUser } from '../types/index';
import { LANGUAGES } from '../types/index';

// Pre-configure CDN for monaco (avoids Vite bundling issues)
loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });

// ── Helpers ───────────────────────────────────────────────
const USER_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#f97316'];
function colorForUser(id: string): string {
  const hash = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return USER_COLORS[hash % USER_COLORS.length];
}

// ── Connection badge ──────────────────────────────────────
function ConnStatus({ status }: { status: 'connected' | 'connecting' | 'disconnected' }) {
  return (
    <div className={`conn-status ${status}`}>
      <div className="conn-dot" />
      {{ connected: 'Live', connecting: 'Connecting…', disconnected: 'Offline' }[status]}
    </div>
  );
}

// ── Output panel ──────────────────────────────────────────
function OutputPanel({ lines, running, stats, onClear }: {
  lines:    OutputLine[];
  running:  boolean;
  stats:    { time?: number; exit?: number } | null;
  onClear:  () => void;
}) {
  const [tab, setTab] = useState<'output' | 'info'>('output');
  const bodyRef       = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [lines]);

  return (
    <div className="output-panel">
      <div className="output-tabs">
        <button className={`output-tab${tab === 'output' ? ' active' : ''}`} onClick={() => setTab('output')}>
          <Terminal size={12} style={{ marginRight: 5 }} />
          Output
          {lines.length > 0 && (
            <span style={{ marginLeft: 6, padding: '1px 6px', background: 'var(--bg-3)', borderRadius: 'var(--r-full)', fontSize: 10, color: 'var(--tx-3)' }}>
              {lines.length}
            </span>
          )}
        </button>
        <button className={`output-tab${tab === 'info' ? ' active' : ''}`} onClick={() => setTab('info')}>
          <Info size={12} style={{ marginRight: 5 }} /> Info
        </button>
      </div>

      <div className="output-body" ref={bodyRef}>
        {tab === 'output' ? (
          running ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--tx-3)', padding: '8px 0' }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              Executing in Docker sandbox…
            </div>
          ) : lines.length === 0 ? (
            <div className="output-empty">
              <div className="output-empty-icon">▶</div>
              <div>Run your code to see output here</div>
              <div style={{ fontSize: 12, color: 'var(--tx-4)', marginTop: 4 }}>Ctrl+Enter or click Run</div>
            </div>
          ) : (
            lines.map((line, i) => (
              <div key={i} className="output-line">
                <span className="output-line-num">{i + 1}</span>
                <span className={`output-${line.type}`}>{line.text}</span>
              </div>
            ))
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>
            {[
              ['Execution env', 'Docker sandbox'],
              ['CPU limit',     '1 vCPU'        ],
              ['Memory limit',  '256 MB'        ],
              ['Timeout',       '10 s'          ],
              ['Queue',         'BullMQ + Redis' ],
              ['CRDT sync',     'Yjs'           ],
              ['Transport',     'Socket.IO'     ],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--tx-3)', fontSize: 12 }}>{label}</span>
                <span style={{ color: 'var(--tx-1)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {(stats || lines.length > 0) && (
        <div className="output-controls">
          <div className="output-stats">
            {stats?.time  !== undefined && <span>⏱ {stats.time}ms</span>}
            {stats?.exit  !== undefined && (
              <span style={{ color: stats.exit === 0 ? 'var(--ac-green)' : 'var(--ac-red)' }}>
                exit {stats.exit}
              </span>
            )}
          </div>
          <button
            onClick={onClear}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-3)', display: 'flex', fontSize: 12, gap: 4, alignItems: 'center' }}
          >
            <X size={12} /> Clear
          </button>
        </div>
      )}
    </div>
  );
}

// ── Share modal ───────────────────────────────────────────
function ShareModal({ roomId, open, onClose }: { roomId: string; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const url   = `${window.location.origin}/room/${roomId}`;

  const copy = () => {
    navigator.clipboard.writeText(url);
    toast.success('Link copied!', 'Share it with your teammates.');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Share room">
      <p style={{ fontSize: 14, color: 'var(--tx-2)' }}>
        Anyone with this link can join and collaborate in real-time.
      </p>
      <div className="share-link">
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
          {url}
        </span>
        <button onClick={copy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ac-blue-vivid)', display: 'flex', flexShrink: 0 }}>
          <Copy size={14} />
        </button>
      </div>
      <Button variant="primary" size="md" icon={<Copy size={14} />} onClick={copy} style={{ width: '100%' }}>
        Copy link
      </Button>
    </Modal>
  );
}

// ── Main component ────────────────────────────────────────
export function EditorPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const toast      = useToast();

  const [room, setRoom]                       = useState<Room | null>(null);
  const [loading, setLoading]                 = useState(true);
  const [code, setCode]                       = useState('');
  const [language, setLanguage]               = useState<Language>('python');
  const [connStatus, setConnStatus]           = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [connectedUsers, setConnectedUsers]   = useState<ConnectedUser[]>([]);
  const [outputLines, setOutputLines]         = useState<OutputLine[]>([]);
  const [runStats, setRunStats]               = useState<{ time?: number; exit?: number } | null>(null);
  const [running, setRunning]                 = useState(false);
  const [shareOpen, setShareOpen]             = useState(false);
  const [langOpen, setLangOpen]               = useState(false);
  const langRef                               = useRef<HTMLDivElement>(null);
  const codeRef                               = useRef(code);
  codeRef.current = code;

  // ── Job poller (fallback if socket result is delayed) ────
  const { startPolling } = useJobPoller({
    onResult:  (lines, stats) => { setOutputLines(lines); setRunStats(stats); },
    onError:   (msg) => { toast.error('Run failed', msg); setRunning(false); },
    onRunning: setRunning,
  });

  // ── Yjs CRDT ─────────────────────────────────────────────
  const { bindEditor, unbindEditor } = useYjsEditor({
    roomId:       roomId ?? '',
    user,
    enabled:      !!roomId && !!user,
    onCodeChange: setCode,
  });

  useEffect(() => () => unbindEditor(), [unbindEditor]);

  // ── Load room ─────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    roomsApi.get(roomId)
      .then((r) => {
        setRoom(r);
        const lang = r.language as Language;
        setLanguage(lang);
        setCode(LANGUAGES[lang]?.starter ?? '');
        setLoading(false);
      })
      .catch(() => navigate('/dashboard'));
  }, [roomId, navigate]);

  // ── Socket lifecycle ──────────────────────────────────────
  useEffect(() => {
    if (!roomId || !user) return;
    const socket = connectSocket();
    setConnStatus('connecting');

    socket.on('connect', () => {
      setConnStatus('connected');
      socket.emit(SocketEvents.JOIN_ROOM, { roomId });
      toast.info('Connected', 'Live collaboration is active.');
    });
    socket.on('disconnect', () => {
      setConnStatus('disconnected');
      toast.warning('Disconnected', 'Attempting to reconnect…');
    });
    socket.on('reconnect', () => {
      setConnStatus('connected');
      socket.emit(SocketEvents.JOIN_ROOM, { roomId });
      toast.success('Reconnected');
    });
    socket.on(SocketEvents.ROOM_STATE, (state: { code: string; users: ConnectedUser[] }) => {
      setCode(state.code);
      setConnectedUsers(state.users);
    });
    socket.on(SocketEvents.USER_JOINED, (u: ConnectedUser) => {
      setConnectedUsers((p) => p.find((x) => x.id === u.id) ? p : [...p, u]);
      toast.info(`${u.username} joined`);
    });
    socket.on(SocketEvents.USER_LEFT, ({ userId, username }: { userId: string; username?: string }) => {
      setConnectedUsers((p) => p.filter((u) => u.id !== userId));
      if (username) toast.info(`${username} left`);
    });
    socket.on(SocketEvents.RUN_RESULT, (result: { stdout: string; stderr: string; exitCode: number; executionTimeMs: number }) => {
      setRunning(false);
      const lines: OutputLine[] = [];
      result.stdout?.split('\n').filter(Boolean).forEach((l) => lines.push({ type: 'stdout', text: l }));
      result.stderr?.split('\n').filter(Boolean).forEach((l) => lines.push({ type: 'stderr', text: l }));
      if (!lines.length) lines.push({ type: 'system', text: '(no output)' });
      setOutputLines(lines);
      setRunStats({ time: result.executionTimeMs, exit: result.exitCode });
      if (result.exitCode === 0) toast.success('Run complete', `Finished in ${result.executionTimeMs}ms`);
      else                       toast.error('Run failed',    `Exit code ${result.exitCode}`);
    });
    socket.on(SocketEvents.ERROR, (msg: string) => {
      setRunning(false);
      toast.error('Error', msg);
    });

    return () => {
      socket.emit(SocketEvents.LEAVE_ROOM, { roomId });
      ['connect','disconnect','reconnect',
       SocketEvents.ROOM_STATE, SocketEvents.USER_JOINED, SocketEvents.USER_LEFT,
       SocketEvents.RUN_RESULT, SocketEvents.ERROR].forEach((ev) => socket.off(ev));
      disconnectSocket();
    };
  }, [roomId, user]);

  // ── Monaco mount ─────────────────────────────────────────
  const handleEditorMount = useCallback((
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof import('monaco-editor'),
  ) => {
    registerMonacoTheme(monaco);
    monaco.editor.setTheme('midnight');
    editor.updateOptions({ cursorBlinking: 'phase', smoothScrolling: true, cursorSmoothCaretAnimation: 'on' });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => handleRun());
    bindEditor(editor, monaco);
  }, [bindEditor]);

  // ── Run ───────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    if (running || !roomId) return;
    setRunning(true);
    setOutputLines([{ type: 'system', text: `▶ Queuing ${LANGUAGES[language].label} job…` }]);
    setRunStats(null);
    try {
      const { jobId } = await execApi.run(roomId, codeRef.current, language);
      startPolling(jobId); // fallback poller; socket result cancels it via setRunning(false)
    } catch (err: any) {
      setRunning(false);
      const msg = err?.message ?? 'Failed to queue job.';
      setOutputLines([{ type: 'stderr', text: msg }]);
      toast.error('Run error', msg);
    }
  }, [running, roomId, language, startPolling, toast]);

  // ── Lang dropdown ─────────────────────────────────────────
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">
          <div className="loading-spinner" />
          <div style={{ fontSize: 14, color: 'var(--tx-3)', marginTop: 8 }}>Loading room…</div>
        </div>
      </div>
    );
  }

  const langCfg = LANGUAGES[language];

  return (
    <div className="editor-page">
      {/* ── Topbar ── */}
      <div className="editor-topbar">
        <button onClick={() => navigate('/dashboard')} className="btn btn-ghost btn-sm" style={{ color: 'var(--tx-3)', padding: '5px 10px' }}>
          <ArrowLeft size={14} />
        </button>
        <div className="editor-topbar-divider" />
        <div className="editor-room-name">{room?.name ?? 'Room'}</div>

        {/* Language picker */}
        <div ref={langRef} style={{ position: 'relative' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setLangOpen((v) => !v)}
            style={{ color: 'var(--tx-2)', gap: 6, border: '1px solid var(--bd-base)', borderRadius: 'var(--r-sm)' }}
          >
            <span>{langCfg.icon}</span>
            <span style={{ fontSize: 13 }}>{langCfg.label}</span>
            <ChevronDown size={12} />
          </button>
          {langOpen && (
            <div className="dropdown" style={{ top: 'calc(100% + 6px)', left: 0, right: 'auto', minWidth: 160 }}>
              {(Object.entries(LANGUAGES) as [Language, typeof LANGUAGES[Language]][]).map(([key, cfg]) => (
                <button key={key} className="dropdown-item"
                  style={language === key ? { color: 'var(--ac-blue-vivid)' } : {}}
                  onClick={() => { setLanguage(key); setLangOpen(false); toast.info(`Switched to ${cfg.label}`); }}
                >
                  <span>{cfg.icon}</span> {cfg.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="editor-topbar-divider" />
        <ConnStatus status={connStatus} />

        <div className="editor-topbar-right">
          {/* User avatars */}
          <div className="editor-users">
            {user && (
              <div className="editor-user-avatar" style={{ background: colorForUser(user.id) }}>
                {user.username.slice(0, 2).toUpperCase()}
                <div className="editor-user-tooltip">{user.username} (you)</div>
              </div>
            )}
            {connectedUsers.filter((u) => u.id !== user?.id).slice(0, 5).map((u) => (
              <div key={u.id} className="editor-user-avatar" style={{ background: u.color || colorForUser(u.id) }}>
                {u.username.slice(0, 2).toUpperCase()}
                <div className="editor-user-tooltip">{u.username}</div>
              </div>
            ))}
            {connectedUsers.length > 5 && (
              <div className="editor-user-avatar" style={{ background: 'var(--bg-4)', fontSize: 10, color: 'var(--tx-2)' }}>
                +{connectedUsers.length - 5}
              </div>
            )}
            <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--tx-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Users size={12} /> {connectedUsers.length + 1}
            </span>
          </div>

          <Button variant="secondary" size="sm" icon={<Share2 size={13} />} onClick={() => setShareOpen(true)}>
            Share
          </Button>

          <button className="run-btn" onClick={handleRun} disabled={running || connStatus !== 'connected'}>
            {running
              ? <><div className="run-btn-spinner" /> Running…</>
              : <><Play size={13} fill="white" /> Run</>}
          </button>
        </div>
      </div>

      {/* ── Main ── */}
      <div className="editor-main">
        {/* Sidebar */}
        <div className="editor-sidebar">
          <div className="editor-sidebar-section">
            <div className="editor-sidebar-label">Explorer</div>
            <div className="editor-file-item active">
              <span>{langCfg.icon}</span> main.{langCfg.extension}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div className="editor-sidebar-section">
            <div className="editor-sidebar-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="live-dot" style={{ width: 5, height: 5 }} />
              Online — {connectedUsers.length + 1}
            </div>
            {user && (
              <div className="editor-online-user">
                <div className="editor-online-dot" style={{ background: colorForUser(user.id), boxShadow: `0 0 5px ${colorForUser(user.id)}` }} />
                <span style={{ color: 'var(--tx-1)', fontSize: 13 }}>{user.username}</span>
                <span style={{ fontSize: 11, color: 'var(--tx-4)', marginLeft: 'auto' }}>you</span>
              </div>
            )}
            {connectedUsers.filter((u) => u.id !== user?.id).map((u) => (
              <div key={u.id} className="editor-online-user">
                <div className="editor-online-dot" style={{ background: u.color || colorForUser(u.id), boxShadow: `0 0 5px ${u.color || colorForUser(u.id)}` }} />
                <span style={{ fontSize: 13 }}>{u.username}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Monaco */}
        <div className="editor-center">
          <div className="editor-tabs">
            <button className="editor-tab active">
              <span>{langCfg.icon}</span> main.{langCfg.extension}
            </button>
          </div>
          <div className="monaco-container">
            <MonacoEditor
              height="100%"
              language={langCfg.monacoId}
              value={code}
              theme="midnight"
              onMount={handleEditorMount}
              options={{
                fontSize:                   14,
                fontFamily:                 "'JetBrains Mono', 'Fira Code', monospace",
                fontLigatures:              true,
                lineHeight:                 22,
                minimap:                    { enabled: false },
                scrollBeyondLastLine:       false,
                tabSize:                    2,
                renderLineHighlight:        'line',
                bracketPairColorization:    { enabled: true },
                padding:                    { top: 16, bottom: 16 },
                smoothScrolling:            true,
                cursorBlinking:             'phase',
                cursorSmoothCaretAnimation: 'on',
                wordWrap:                   'off',
                automaticLayout:            true,
                scrollbar:                  { verticalScrollbarSize: 5, horizontalScrollbarSize: 5 },
                overviewRulerLanes:         0,
                glyphMargin:                false,
                lineDecorationsWidth:       8,
              }}
            />
          </div>
        </div>

        <OutputPanel lines={outputLines} running={running} stats={runStats} onClear={() => { setOutputLines([]); setRunStats(null); }} />
      </div>

      {/* ── Status bar ── */}
      <div className="editor-statusbar">
        <div className="statusbar-item"><span>{langCfg.icon}</span> {langCfg.label}</div>
        <div className="statusbar-sep" />
        <div className="statusbar-item">
          {room?.isPublic ? <><Globe size={11} /> Public</> : <><Lock size={11} /> Private</>}
        </div>
        <div className="statusbar-sep" />
        <div className="statusbar-item"><div className="live-dot" style={{ width: 5, height: 5 }} />{connectedUsers.length + 1} online</div>
        <div className="statusbar-sep" />
        <div className="statusbar-item">Yjs CRDT</div>
        <div style={{ marginLeft: 'auto' }} className="statusbar-item">Ctrl+Enter to run</div>
      </div>

      <ShareModal roomId={roomId!} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}
