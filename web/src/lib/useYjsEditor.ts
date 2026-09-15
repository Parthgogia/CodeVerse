import { useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import type * as Monaco from 'monaco-editor';
import { connectSocket } from './socket';
import type { User } from '../types';

interface AwarenessState {
  userId:    string;
  username:  string;
  color:     string;
  cursor:    { lineNumber: number; column: number } | null;
  selection: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } | null;
}

const PALETTE = ['#5b4ef0','#10b981','#f59e0b','#f43f5e','#8b5cf6','#22d3ee','#ec4899','#f97316'];

// ── Wire format ──────────────────────────────────────────
// Every local transaction produces an incremental update via ydoc.on('update');
// that buffer — O(change), not O(document) — is what goes over the socket, as a
// Uint8Array so Socket.IO sends a binary frame instead of a JSON number[].
// Transaction origins keep the loop from echoing: only LOCAL-origin updates are
// sent; anything applied from the network is tagged REMOTE and never re-sent.
const LOCAL  = 'local';
const REMOTE = 'remote';
const SILENT = 'silent';   // written locally but deliberately not broadcast

// Incremental updates have one weakness: if one is dropped (rate limited), peers
// park every later update as "pending" until the gap is filled. The server acks
// each update; a rate-limited ack says when the window resets, and one full-state
// resend is scheduled for just after that — a full state carries everything that
// was missed. The fallback delay only applies if the ack carries no timing.
const RESYNC_FALLBACK_MS = 1_500;
const RESYNC_SLACK_MS    = 250;

type WireBytes = Uint8Array | ArrayBuffer | number[];

/** Socket.IO hands binary to the browser as ArrayBuffer; old clients/harnesses send number[]. */
function toBytes(u: unknown): Uint8Array {
  if (u instanceof Uint8Array)  return u;
  if (u instanceof ArrayBuffer) return new Uint8Array(u);
  if (Array.isArray(u))         return Uint8Array.from(u);
  return new Uint8Array(0);
}

// One Y.Text per language, all inside the same Y.Doc. Switching language
// rebinds the editor to another text instead of overwriting the only one —
// which is how a switch used to erase the previous language's code.
// Mirrored in backend/src/realtime/roomDocs.ts.
const textKey = (language: string) => `code:${language}`;

function colorForUser(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) & 0xffffffff;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

const injectedStyles = new Set<string>();
function injectCursorCSS(userId: string, color: string): void {
  if (injectedStyles.has(userId)) return;
  injectedStyles.add(userId);
  const el = document.createElement('style');
  el.textContent = `
    .remote-cursor-${userId} {
      border-left: 2px solid ${color};
      box-shadow: 0 0 4px ${color}88;
      margin-left: -1px;
    }
    .remote-cursor-label-${userId}::before {
      content: attr(data-username);
      position: absolute;
      top: -18px; left: -1px;
      padding: 1px 6px;
      background: ${color};
      color: #fff;
      font-size: 10px;
      font-weight: 600;
      border-radius: 3px 3px 3px 0;
      white-space: nowrap;
      font-family: var(--font-sans);
      pointer-events: none;
      line-height: 1.4;
    }
    .remote-selection-${userId} {
      background: ${color}1e;
      border: 1px solid ${color}35;
    }`;
  document.head.appendChild(el);
}

interface Options {
  roomId:        string;
  user:          User | null;
  enabled:       boolean;
  onCodeChange?: (code: string) => void;
}

interface YjsEditorReturn {
  initializeCode:   (code: string) => void;
  setCode:          (code: string) => void;
  applyServerState: (update: WireBytes) => void;
  /** Rebind the editor to `language`'s text. Returns that text (empty = never written). */
  switchLanguage:   (language: string) => string;
  /** Current language's text, straight from the CRDT. */
  getText:          () => string;
  bindEditor:       (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => void;
  unbindEditor:     () => void;
}

export function useYjsEditor({ roomId, user, enabled, onCodeChange }: Options): YjsEditorReturn {
  const ydocRef        = useRef<Y.Doc | null>(null);
  const ytextRef       = useRef<Y.Text | null>(null);
  const languageRef    = useRef<string>('python');
  const observerRef    = useRef<(() => void) | null>(null);
  const editorRef      = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef      = useRef<typeof import('monaco-editor') | null>(null);
  const decorationsRef = useRef<Map<string, string[]>>(new Map());

  const suppressYjs    = useRef(false);
  const suppressMonaco = useRef(false);
  const initialized    = useRef(false);
  const resyncTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Create Y.Doc on mount ──────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const ydoc  = new Y.Doc();
    const ytext = ydoc.getText(textKey(languageRef.current));
    ydocRef.current  = ydoc;
    ytextRef.current = ytext;
    initialized.current = false;

    return () => {
      ydoc.destroy();
      ydocRef.current  = null;
      ytextRef.current = null;
      initialized.current = false;
    };
  }, [enabled, roomId]);

  // ── Socket: receive Yjs binary updates + awareness ─────
  useEffect(() => {
    if (!enabled || !user) return;
    const socket = connectSocket();

    // ── outbound ──
    const send = (update: Uint8Array) => {
      socket.emit('yjs:update', { roomId, update }, (ack?: { ok: boolean; reason?: string; retryAfterMs?: number }) => {
        if (ack?.ok === false && ack.reason === 'rate-limited') scheduleResync(ack.retryAfterMs);
      });
    };
    const scheduleResync = (retryAfterMs?: number) => {
      if (resyncTimer.current) return;             // one resync covers every drop in the window
      const delay = (retryAfterMs ?? RESYNC_FALLBACK_MS) + RESYNC_SLACK_MS;
      resyncTimer.current = setTimeout(() => {
        resyncTimer.current = null;
        const ydoc = ydocRef.current;
        if (ydoc) send(Y.encodeStateAsUpdate(ydoc));   // full state fills any gap
      }, delay);
    };
    const onLocalUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === LOCAL) send(update);
    };
    ydocRef.current?.on('update', onLocalUpdate);

    // ── inbound ──
    const onYjsUpdate = ({ update }: { update: WireBytes }) => {
      const ydoc = ydocRef.current;
      if (!ydoc) return;
      suppressMonaco.current = true;
      try { Y.applyUpdate(ydoc, toBytes(update), REMOTE); }
      finally { suppressMonaco.current = false; }
    };

    const onAwareness = (state: AwarenessState) => {
      if (state.userId === user.id) return;
      renderRemoteCursor(state);
    };

    const onUserLeft = ({ userId }: { userId: string }) => {
      clearRemoteCursor(userId);
    };

    // ✅ When a new user joins, broadcast our full document state so they
    // immediately receive the current code without needing a keystroke. This is
    // the one deliberate full-state send left; it is rare (once per arrival).
    const onUserJoined = () => {
      const ydoc = ydocRef.current;
      if (!ydoc) return;
      const fullUpdate = Y.encodeStateAsUpdate(ydoc);
      if (fullUpdate.length > 2) send(fullUpdate);   // empty Y.Doc encodes to 2 bytes
    };

    socket.on('yjs:update',       onYjsUpdate);
    socket.on('yjs:awareness',    onAwareness);
    socket.on('room:user-left',   onUserLeft);
    socket.on('room:user-joined', onUserJoined);

    return () => {
      ydocRef.current?.off('update', onLocalUpdate);
      if (resyncTimer.current) { clearTimeout(resyncTimer.current); resyncTimer.current = null; }
      socket.off('yjs:update',       onYjsUpdate);
      socket.off('yjs:awareness',    onAwareness);
      socket.off('room:user-left',   onUserLeft);
      socket.off('room:user-joined', onUserJoined);
    };
  }, [enabled, roomId, user?.id]);

  // ── initializeCode ─────────────────────────────────────
  const initializeCode = useCallback((code: string) => {
    const ytext = ytextRef.current;
    if (!ytext) return;

    initialized.current = true;
    suppressYjs.current = true;
    try {
      const current = ytext.toString();
      if (current !== code) {
        ytext.doc!.transact(() => {
          ytext.delete(0, ytext.length);
          if (code) ytext.insert(0, code);
        }, SILENT);
      }
    } finally {
      suppressYjs.current = false;
    }

    // If editor is already bound, sync Monaco model to match
    const editor = editorRef.current;
    if (editor) {
      const model = editor.getModel();
      if (model && model.getValue() !== code) {
        suppressMonaco.current = true;
        model.setValue(code);
        suppressMonaco.current = false;
      }
    }

    onCodeChange?.(code);
  }, [onCodeChange]);

  // ── applyServerState ───────────────────────────────────
  // Restores the room's saved document. The server sends the Yjs state as
  // bytes rather than text on purpose: applying the identical CRDT operations
  // reproduces the document exactly, whereas re-typing the text as a fresh
  // insert would duplicate content the moment it merged with anyone else's copy.
  const applyServerState = useCallback((update: WireBytes) => {
    const ydoc  = ydocRef.current;
    const bytes = toBytes(update);
    // An empty Y.Doc encodes to 2 bytes — nothing to restore.
    if (!ydoc || bytes.length <= 2) return;

    initialized.current    = true;
    suppressMonaco.current = true;
    try {
      Y.applyUpdate(ydoc, bytes, REMOTE);
    } finally {
      suppressMonaco.current = false;
    }

    // If the editor is already mounted the Y.Text observer has synced Monaco
    // for us; if not, bindEditor's initial sync will. Either way, make sure the
    // consumer's copy of the code is current.
    const text = ytextRef.current?.toString() ?? '';
    onCodeChange?.(text);
  }, [onCodeChange]);

  // ── setCode (Programmatic update that broadcasts) ────────
  const setCode = useCallback((code: string) => {
    const ytext = ytextRef.current;
    // If Y.Text isn't ready, still notify consumer so local state/refs stay current
    if (!ytext) {
      onCodeChange?.(code);
      return;
    }
    
    suppressYjs.current = true;
    try {
      // LOCAL origin → the 'update' listener sends the incremental diff.
      ytext.doc!.transact(() => {
        ytext.delete(0, ytext.length);
        if (code) ytext.insert(0, code);
      }, LOCAL);
    } finally {
      suppressYjs.current = false;
    }

    const editor = editorRef.current;
    if (editor) {
      const model = editor.getModel();
      if (model && model.getValue() !== code) {
        suppressMonaco.current = true;
        model.setValue(code);
        suppressMonaco.current = false;
      }
    }

    // Ensure consumers (e.g. EditorPage) receive the programmatic update
    onCodeChange?.(code);
  }, [onCodeChange]);

  // ── switchLanguage ─────────────────────────────────────
  // Nothing is deleted or inserted here: the previous language's text stays in
  // the document untouched, the editor simply starts showing a different one.
  // If the editor is bound, its observer moves to the new text and Monaco is
  // set to that text's content under suppression so nothing echoes back.
  const switchLanguage = useCallback((language: string): string => {
    languageRef.current = language;
    const ydoc = ydocRef.current;
    if (!ydoc) return '';

    const prev = ytextRef.current;
    const next = ydoc.getText(textKey(language));
    if (prev === next) return next.toString();

    const observer = observerRef.current;
    if (observer && prev) prev.unobserve(observer);
    ytextRef.current = next;
    if (observer) next.observe(observer);

    const text   = next.toString();
    const editor = editorRef.current;
    const model  = editor?.getModel();
    if (model && model.getValue() !== text) {
      suppressMonaco.current = true;
      try { model.setValue(text); } finally { suppressMonaco.current = false; }
    }
    onCodeChange?.(text);
    return text;
  }, [onCodeChange]);

  const getText = useCallback((): string => ytextRef.current?.toString() ?? '', []);

  // ── Remote cursor rendering ────────────────────────────
  const renderRemoteCursor = useCallback((state: AwarenessState) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !state.cursor) return;

    const color = state.color || colorForUser(state.userId);
    injectCursorCSS(state.userId, color);

    const decorations: Monaco.editor.IModelDeltaDecoration[] = [
      {
        range: new monaco.Range(
          state.cursor.lineNumber, state.cursor.column,
          state.cursor.lineNumber, state.cursor.column,
        ),
        options: {
          className:              `remote-cursor-${state.userId}`,
          beforeContentClassName: `remote-cursor-label-${state.userId}`,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          hoverMessage: { value: `**${state.username}**` },
        },
      },
    ];

    if (state.selection && !(
      state.selection.startLineNumber === state.selection.endLineNumber &&
      state.selection.startColumn     === state.selection.endColumn
    )) {
      decorations.push({
        range: new monaco.Range(
          state.selection.startLineNumber, state.selection.startColumn,
          state.selection.endLineNumber,   state.selection.endColumn,
        ),
        options: {
          className:  `remote-selection-${state.userId}`,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      });
    }

    const old  = decorationsRef.current.get(state.userId) ?? [];
    const next = editor.deltaDecorations(old, decorations);
    decorationsRef.current.set(state.userId, next);
  }, []);

  const clearRemoteCursor = useCallback((userId: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const old = decorationsRef.current.get(userId) ?? [];
    editor.deltaDecorations(old, []);
    decorationsRef.current.delete(userId);
  }, []);

  // ── bindEditor ─────────────────────────────────────────
  const bindEditor = useCallback((
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof import('monaco-editor'),
  ) => {
    editorRef.current  = editor;
    monacoRef.current  = monaco;

    if (!enabled || !user) return;

    const socket = connectSocket();
    const ytext  = ytextRef.current;
    if (!ytext) return;

    // ── Yjs → Monaco ─────────────────────────────────────
    // Reads ytextRef at call time, not the `ytext` captured above, because
    // switchLanguage re-points it and moves this observer to the new text.
    const onYjsChange = () => {
      if (suppressYjs.current) return;
      const model = editor.getModel();
      if (!model) return;

      suppressMonaco.current = true;
      try {
        const newText = ytextRef.current?.toString() ?? '';
        if (model.getValue() !== newText) {
          const pos = editor.getPosition();
          model.setValue(newText);
          if (pos) editor.setPosition(pos);
          onCodeChange?.(newText);
        }
      } finally {
        suppressMonaco.current = false;
      }
    };

    ytext.observe(onYjsChange);
    observerRef.current = onYjsChange;

    // ✅ Initial sync — if initializeCode was called before the editor mounted,
    // Y.Text already has content; push it into Monaco now so they're in sync
    // before the user can type anything.
    const existingText = ytext.toString();
    const model        = editor.getModel();
    if (model && existingText && model.getValue() !== existingText) {
      suppressMonaco.current = true;
      model.setValue(existingText);
      suppressMonaco.current = false;
      onCodeChange?.(existingText);
    }

    // ── Monaco → Yjs ─────────────────────────────────────
    const disposeChange = editor.onDidChangeModelContent((e) => {
      if (suppressMonaco.current) return;

      suppressYjs.current = true;
      try {
        const ydoc  = ydocRef.current!;
        const ytext = ytextRef.current!;       // current language's text
        // LOCAL origin → the 'update' listener sends just this transaction's diff.
        ydoc.transact(() => {
          const sorted = [...e.changes].sort((a, b) => b.rangeOffset - a.rangeOffset);
          for (const ch of sorted) {
            if (ch.rangeLength > 0) ytext.delete(ch.rangeOffset, ch.rangeLength);
            if (ch.text)            ytext.insert(ch.rangeOffset, ch.text);
          }
        }, LOCAL);
        onCodeChange?.(ytext.toString());
      } finally {
        suppressYjs.current = false;
      }
    });

    // ── Cursor awareness ──────────────────────────────────
    const color = colorForUser(user.id);

    const disposePos = editor.onDidChangeCursorPosition((e) => {
      socket.emit('yjs:awareness', {
        roomId,
        state: {
          userId:    user.id,
          username:  user.username,
          color,
          cursor:    { lineNumber: e.position.lineNumber, column: e.position.column },
          selection: null,
        } satisfies AwarenessState,
      });
    });

    const disposeSel = editor.onDidChangeCursorSelection((e) => {
      const sel     = e.selection;
      const isEmpty = sel.isEmpty();
      socket.emit('yjs:awareness', {
        roomId,
        state: {
          userId:    user.id,
          username:  user.username,
          color,
          cursor:    { lineNumber: sel.positionLineNumber, column: sel.positionColumn },
          selection: isEmpty ? null : {
            startLineNumber: sel.startLineNumber, startColumn: sel.startColumn,
            endLineNumber:   sel.endLineNumber,   endColumn:   sel.endColumn,
          },
        } satisfies AwarenessState,
      });
    });

    (editor as any).__yjsDisposables = [disposeChange, disposePos, disposeSel];
    (editor as any).__yjsObserver    = onYjsChange;
  }, [enabled, roomId, user?.id, user?.username, onCodeChange]);

  // ── unbindEditor ───────────────────────────────────────
  const unbindEditor = useCallback(() => {
    const editor = editorRef.current;
    const ytext  = ytextRef.current;

    if (editor) {
      const disposables: Monaco.IDisposable[] = (editor as any).__yjsDisposables ?? [];
      disposables.forEach((d) => d.dispose());
      const observer = (editor as any).__yjsObserver;
      if (observer && ytext) ytext.unobserve(observer);
    }
    observerRef.current = null;

    decorationsRef.current.forEach((_, id) => clearRemoteCursor(id));
    decorationsRef.current.clear();

    editorRef.current = null;
    monacoRef.current = null;
  }, [clearRemoteCursor]);

  return { initializeCode, setCode, applyServerState, switchLanguage, getText, bindEditor, unbindEditor };
}