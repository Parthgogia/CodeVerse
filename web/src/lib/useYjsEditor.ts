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
  initializeCode: (code: string) => void;
  setCode:        (code: string) => void;
  bindEditor:     (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => void;
  unbindEditor:   () => void;
}

export function useYjsEditor({ roomId, user, enabled, onCodeChange }: Options): YjsEditorReturn {
  const ydocRef        = useRef<Y.Doc | null>(null);
  const ytextRef       = useRef<Y.Text | null>(null);
  const editorRef      = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef      = useRef<typeof import('monaco-editor') | null>(null);
  const decorationsRef = useRef<Map<string, string[]>>(new Map());

  const suppressYjs    = useRef(false);
  const suppressMonaco = useRef(false);
  const initialized    = useRef(false);

  // ── Create Y.Doc on mount ──────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const ydoc  = new Y.Doc();
    const ytext = ydoc.getText('code');
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

    const onYjsUpdate = ({ update }: { update: number[] }) => {
      const ydoc = ydocRef.current;
      if (!ydoc) return;
      suppressMonaco.current = true;
      Y.applyUpdate(ydoc, new Uint8Array(update));
      suppressMonaco.current = false;
    };

    const onAwareness = (state: AwarenessState) => {
      if (state.userId === user.id) return;
      renderRemoteCursor(state);
    };

    const onUserLeft = ({ userId }: { userId: string }) => {
      clearRemoteCursor(userId);
    };

    // ✅ When a new user joins, broadcast our full document state so they
    // immediately receive the current code without needing a keystroke.
    const onUserJoined = () => {
      const ydoc = ydocRef.current;
      if (!ydoc) return;
      const fullUpdate = Y.encodeStateAsUpdate(ydoc);
      if (fullUpdate.length > 2) {
        // Only emit if doc is non-empty (Yjs empty doc is 2 bytes)
        socket.emit('yjs:update', { roomId, update: Array.from(fullUpdate) });
      }
    };

    socket.on('yjs:update',       onYjsUpdate);
    socket.on('yjs:awareness',    onAwareness);
    socket.on('room:user-left',   onUserLeft);
    socket.on('room:user-joined', onUserJoined);

    return () => {
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
        ytext.delete(0, ytext.length);
        if (code) ytext.insert(0, code);
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

  // ── setCode (Programmatic update that broadcasts) ────────
  const setCode = useCallback((code: string) => {
    const ytext = ytextRef.current;
    if (!ytext) return;
    
    suppressYjs.current = true;
    try {
      ytext.delete(0, ytext.length);
      if (code) ytext.insert(0, code);
      
      const ydoc = ydocRef.current;
      if (ydoc) {
        const socket = connectSocket();
        const update = Y.encodeStateAsUpdate(ydoc);
        socket.emit('yjs:update', { roomId, update: Array.from(update) });
      }
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
  }, [roomId]);

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
    const onYjsChange = () => {
      if (suppressYjs.current) return;
      const model = editor.getModel();
      if (!model) return;

      suppressMonaco.current = true;
      try {
        const newText = ytext.toString();
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
        const ydoc = ydocRef.current!;
        ydoc.transact(() => {
          const sorted = [...e.changes].sort((a, b) => b.rangeOffset - a.rangeOffset);
          for (const ch of sorted) {
            if (ch.rangeLength > 0) ytext.delete(ch.rangeOffset, ch.rangeLength);
            if (ch.text)            ytext.insert(ch.rangeOffset, ch.text);
          }
        });

        const update = Y.encodeStateAsUpdate(ydoc);
        socket.emit('yjs:update', { roomId, update: Array.from(update) });
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

    decorationsRef.current.forEach((_, id) => clearRemoteCursor(id));
    decorationsRef.current.clear();

    editorRef.current = null;
    monacoRef.current = null;
  }, [clearRemoteCursor]);

  return { initializeCode, setCode, bindEditor, unbindEditor };
}