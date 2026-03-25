import { useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import type * as Monaco from 'monaco-editor';
import { connectSocket, SocketEvents } from './socket';
import type { User } from '../types';

// ── Types ─────────────────────────────────────────────────
interface AwarenessState {
  userId:   string;
  username: string;
  color:    string;
  cursor:   { lineNumber: number; column: number } | null;
  selection?: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } | null;
}

const USER_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#f97316',
];

function colorForUser(userId: string): string {
  const hash = userId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return USER_COLORS[hash % USER_COLORS.length];
}

// CSS style injection for remote cursors
function injectCursorStyles(userId: string, color: string): void {
  const styleId = `cursor-style-${userId}`;
  if (document.getElementById(styleId)) return;
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .remote-cursor-${userId} {
      border-left: 2px solid ${color};
      box-shadow: 0 0 6px ${color}88;
      margin-left: -1px;
    }
    .remote-cursor-label-${userId} {
      position: absolute;
      top: -18px;
      left: -1px;
      padding: 2px 6px;
      background: ${color};
      color: #fff;
      font-size: 10px;
      font-weight: 600;
      border-radius: 3px 3px 3px 0;
      white-space: nowrap;
      font-family: var(--font-body);
      pointer-events: none;
      line-height: 1.4;
    }
    .remote-selection-${userId} {
      background: ${color}20;
      border: 1px solid ${color}40;
    }
  `;
  document.head.appendChild(style);
}

// ── Main hook ─────────────────────────────────────────────
interface UseYjsEditorOptions {
  roomId:  string;
  user:    User | null;
  enabled: boolean;
  onCodeChange?: (code: string) => void;
}

interface UseYjsEditorReturn {
  bindEditor:   (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => void;
  unbindEditor: () => void;
  ydoc:         React.MutableRefObject<Y.Doc | null>;
}

export function useYjsEditor({ roomId, user, enabled, onCodeChange }: UseYjsEditorOptions): UseYjsEditorReturn {
  const ydocRef          = useRef<Y.Doc | null>(null);
  const ytextRef         = useRef<Y.Text | null>(null);
  const editorRef        = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef        = useRef<typeof import('monaco-editor') | null>(null);
  const decorationsRef   = useRef<Map<string, string[]>>(new Map());
  const suppressYjs      = useRef(false);
  const suppressMonaco   = useRef(false);

  // ── Init Yjs doc ─────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const ydoc  = new Y.Doc();
    const ytext = ydoc.getText('code');
    ydocRef.current  = ydoc;
    ytextRef.current = ytext;

    return () => {
      ydoc.destroy();
      ydocRef.current  = null;
      ytextRef.current = null;
    };
  }, [enabled, roomId]);

  // ── Socket: receive Yjs updates ──────────────────────────
  useEffect(() => {
    if (!enabled || !user) return;
    const socket = connectSocket();

    // Receive Yjs binary update
    const onYjsUpdate = ({ update }: { update: number[] }) => {
      const ydoc = ydocRef.current;
      if (!ydoc) return;
      suppressMonaco.current = true;
      Y.applyUpdate(ydoc, new Uint8Array(update));
      suppressMonaco.current = false;
    };

    // Receive awareness (cursors) from other users
    const onCursorUpdate = (state: AwarenessState) => {
      if (state.userId === user.id) return;
      renderRemoteCursor(state);
    };

    const onUserLeft = ({ userId }: { userId: string }) => {
      clearRemoteCursor(userId);
    };

    socket.on('yjs:update',    onYjsUpdate);
    socket.on('yjs:awareness', onCursorUpdate);
    socket.on(SocketEvents.USER_LEFT, onUserLeft);

    return () => {
      socket.off('yjs:update',    onYjsUpdate);
      socket.off('yjs:awareness', onCursorUpdate);
      socket.off(SocketEvents.USER_LEFT, onUserLeft);
    };
  }, [enabled, user, roomId]);

  // ── Render remote cursor decorations ─────────────────────
  const renderRemoteCursor = useCallback((state: AwarenessState) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !state.cursor) return;

    const color = state.color || colorForUser(state.userId);
    injectCursorStyles(state.userId, color);

    const decorations: Monaco.editor.IModelDeltaDecoration[] = [];

    // Cursor line
    if (state.cursor) {
      decorations.push({
        range: new monaco.Range(
          state.cursor.lineNumber, state.cursor.column,
          state.cursor.lineNumber, state.cursor.column,
        ),
        options: {
          className:    `remote-cursor-${state.userId}`,
          beforeContentClassName: `remote-cursor-label-${state.userId}`,
          stickiness:   monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          hoverMessage: { value: state.username },
        },
      });
    }

    // Selection highlight
    if (state.selection) {
      decorations.push({
        range: new monaco.Range(
          state.selection.startLineNumber, state.selection.startColumn,
          state.selection.endLineNumber,   state.selection.endColumn,
        ),
        options: {
          className: `remote-selection-${state.userId}`,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      });
    }

    // Apply
    const oldDecorations = decorationsRef.current.get(state.userId) ?? [];
    const newDecorations  = editor.deltaDecorations(oldDecorations, decorations);
    decorationsRef.current.set(state.userId, newDecorations);
  }, []);

  const clearRemoteCursor = useCallback((userId: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const old = decorationsRef.current.get(userId) ?? [];
    editor.deltaDecorations(old, []);
    decorationsRef.current.delete(userId);
  }, []);

  // ── Bind editor instance ─────────────────────────────────
  const bindEditor = useCallback((
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof import('monaco-editor'),
  ) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    if (!enabled || !user) return;

    const socket = connectSocket();
    const ytext  = ytextRef.current;
    if (!ytext) return;

    // ── Yjs → Monaco ─────────────────────────────────────
    const onYjsChange = (events: Y.YEvent<any>[]) => {
      if (suppressYjs.current) return;
      const model = editor.getModel();
      if (!model) return;

      suppressMonaco.current = true;
      try {
        // Reconstruct full text from Yjs (simple + reliable)
        const fullText = ytext.toString();
        const currentText = model.getValue();
        if (fullText !== currentText) {
          const savedPos = editor.getPosition();
          model.setValue(fullText);
          if (savedPos) editor.setPosition(savedPos);
        }
        onCodeChange?.(fullText);
      } finally {
        suppressMonaco.current = false;
      }
    };

    ytext.observe(onYjsChange);

    // ── Monaco → Yjs ─────────────────────────────────────
    const disposeChange = editor.onDidChangeModelContent((e) => {
      if (suppressMonaco.current) return;
      const model = editor.getModel();
      if (!model) return;

      suppressYjs.current = true;
      try {
        const ydoc = ydocRef.current!;
        ydoc.transact(() => {
          // Apply each Monaco change to Yjs
          for (const change of [...e.changes].sort((a, b) => b.rangeOffset - a.rangeOffset)) {
            ytext.delete(change.rangeOffset, change.rangeLength);
            if (change.text) ytext.insert(change.rangeOffset, change.text);
          }
        });

        // Broadcast Yjs update
        const update = Y.encodeStateAsUpdate(ydoc);
        socket.emit('yjs:update', { roomId, update: Array.from(update) });
        onCodeChange?.(ytext.toString());
      } finally {
        suppressYjs.current = false;
      }
    });

    // ── Broadcast cursor position (awareness) ─────────────
    const disposePos = editor.onDidChangeCursorPosition((e) => {
      const color = colorForUser(user.id);
      const awareness: AwarenessState = {
        userId:   user.id,
        username: user.username,
        color,
        cursor: { lineNumber: e.position.lineNumber, column: e.position.column },
        selection: null,
      };
      socket.emit('yjs:awareness', { roomId, state: awareness });
    });

    const disposeSel = editor.onDidChangeCursorSelection((e) => {
      const sel = e.selection;
      const isEmpty = sel.isEmpty();
      const color = colorForUser(user.id);
      const awareness: AwarenessState = {
        userId:   user.id,
        username: user.username,
        color,
        cursor: { lineNumber: sel.positionLineNumber, column: sel.positionColumn },
        selection: isEmpty ? null : {
          startLineNumber: sel.startLineNumber,
          startColumn:     sel.startColumn,
          endLineNumber:   sel.endLineNumber,
          endColumn:       sel.endColumn,
        },
      };
      socket.emit('yjs:awareness', { roomId, state: awareness });
    });

    // Store disposables for cleanup
    (editor as any).__yjsDisposables = [disposeChange, disposePos, disposeSel];
    (editor as any).__yjsObserver   = onYjsChange;
  }, [enabled, user, roomId, onCodeChange, renderRemoteCursor]);

  // ── Unbind ────────────────────────────────────────────────
  const unbindEditor = useCallback(() => {
    const editor = editorRef.current;
    const ytext  = ytextRef.current;

    if (editor) {
      const disposables = (editor as any).__yjsDisposables ?? [];
      disposables.forEach((d: Monaco.IDisposable) => d.dispose());
      const observer = (editor as any).__yjsObserver;
      if (observer && ytext) ytext.unobserve(observer);
    }

    // Clear all remote decorations
    decorationsRef.current.forEach((_, userId) => clearRemoteCursor(userId));
    decorationsRef.current.clear();

    editorRef.current = null;
    monacoRef.current = null;
  }, [clearRemoteCursor]);

  return { bindEditor, unbindEditor, ydoc: ydocRef };
}
