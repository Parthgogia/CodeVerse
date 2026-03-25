import type * as Monaco from 'monaco-editor';

export const MIDNIGHT_THEME: Monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    // Base
    { token: '',             foreground: 'd4e8ff', background: '030810' },

    // Comments
    { token: 'comment',      foreground: '4b7099', fontStyle: 'italic' },
    { token: 'comment.doc',  foreground: '5a88b0', fontStyle: 'italic' },

    // Keywords
    { token: 'keyword',      foreground: 'c084fc' },
    { token: 'keyword.flow', foreground: 'f0abfc' },

    // Types / Classes
    { token: 'type',         foreground: 'f0abfc' },
    { token: 'typeParameter',foreground: 'f0abfc' },
    { token: 'class',        foreground: 'fbbf24' },
    { token: 'struct',       foreground: 'fbbf24' },
    { token: 'interface',    foreground: 'a5f3fc' },
    { token: 'enum',         foreground: 'fbbf24' },

    // Functions / Methods
    { token: 'function',     foreground: '60a5fa' },
    { token: 'method',       foreground: '60a5fa' },
    { token: 'member',       foreground: '93c5fd' },

    // Variables
    { token: 'variable',     foreground: 'd4e8ff' },
    { token: 'variable.readonly', foreground: 'a5b4fc' },
    { token: 'parameter',    foreground: 'fdba74' },
    { token: 'property',     foreground: '7dd3fc' },

    // Strings
    { token: 'string',       foreground: '86efac' },
    { token: 'string.escape',foreground: '4ade80' },
    { token: 'regexp',       foreground: 'fb923c' },

    // Numbers
    { token: 'number',       foreground: 'fb923c' },
    { token: 'number.hex',   foreground: 'fb923c' },
    { token: 'number.float', foreground: 'fb923c' },

    // Operators
    { token: 'operator',     foreground: '7dd3fc' },
    { token: 'delimiter',    foreground: '6ea8d4' },

    // Markup / HTML
    { token: 'tag',          foreground: 'f87171' },
    { token: 'attribute.name',  foreground: 'fbbf24' },
    { token: 'attribute.value', foreground: '86efac' },

    // Python specific
    { token: 'keyword.python',  foreground: 'c084fc' },
    { token: 'builtin.python',  foreground: '60a5fa' },

    // Java specific
    { token: 'annotation',   foreground: 'fbbf24' },

    // C++ specific
    { token: 'macro',        foreground: 'fb923c' },
    { token: 'preprocessor', foreground: 'f59e0b' },

    // Decorators
    { token: 'decorator',    foreground: 'fbbf24' },
  ],
  colors: {
    // Editor core
    'editor.background':                   '#030810',
    'editor.foreground':                   '#d4e8ff',
    'editor.lineHighlightBackground':      '#0a1628',
    'editor.lineHighlightBorder':          '#132847',
    'editor.selectionBackground':          '#1d4ed880',
    'editor.selectionHighlightBackground': '#1d4ed840',
    'editor.inactiveSelectionBackground':  '#132847',
    'editor.wordHighlightBackground':      '#1e3a5f70',
    'editor.wordHighlightStrongBackground':'#1e3a5f99',
    'editor.findMatchBackground':          '#f59e0b40',
    'editor.findMatchHighlightBackground': '#f59e0b20',
    'editor.rangeHighlightBackground':     '#1d4ed820',
    'editor.hoverHighlightBackground':     '#0e1f38',

    // Cursor
    'editorCursor.foreground':             '#60a5fa',
    'editorCursor.background':             '#030810',

    // Line numbers
    'editorLineNumber.foreground':         '#233650',
    'editorLineNumber.activeForeground':   '#4270a0',

    // Gutter
    'editorGutter.background':             '#030810',
    'editorGutter.addedBackground':        '#10b98150',
    'editorGutter.modifiedBackground':     '#3b82f650',
    'editorGutter.deletedBackground':      '#ef444450',

    // Indent guides
    'editorIndentGuide.background':        '#0e1f38',
    'editorIndentGuide.activeBackground':  '#1d4ed840',

    // Bracket matching
    'editorBracketMatch.background':       '#1d4ed840',
    'editorBracketMatch.border':           '#3b82f6',

    // Widgets
    'editorWidget.background':             '#060f1e',
    'editorWidget.border':                 '#0e1f38',
    'editorWidget.foreground':             '#7da6d4',
    'editorSuggestWidget.background':      '#060f1e',
    'editorSuggestWidget.border':          '#132847',
    'editorSuggestWidget.foreground':      '#d4e8ff',
    'editorSuggestWidget.selectedBackground': '#0e1f38',
    'editorSuggestWidget.selectedForeground': '#d4e8ff',
    'editorSuggestWidget.highlightForeground': '#60a5fa',

    // Hover
    'editorHoverWidget.background':        '#060f1e',
    'editorHoverWidget.border':            '#132847',
    'editorHoverWidget.foreground':        '#d4e8ff',

    // Code lens
    'editorCodeLens.foreground':           '#4270a0',

    // Minimap
    'minimap.background':                  '#030810',
    'minimap.selectionHighlight':          '#1d4ed880',
    'minimapGutter.addedBackground':       '#10b98150',
    'minimapGutter.modifiedBackground':    '#3b82f650',
    'minimapGutter.deletedBackground':     '#ef444450',

    // Scrollbar
    'scrollbar.shadow':                    '#00000060',
    'scrollbarSlider.background':          '#1d4ed830',
    'scrollbarSlider.hoverBackground':     '#1d4ed850',
    'scrollbarSlider.activeBackground':    '#1d4ed870',

    // Diff editor
    'diffEditor.insertedTextBackground':   '#10b98115',
    'diffEditor.removedTextBackground':    '#ef444415',
    'diffEditor.insertedLineBackground':   '#10b9810a',
    'diffEditor.removedLineBackground':    '#ef44440a',

    // Input
    'input.background':                    '#060f1e',
    'input.border':                        '#132847',
    'input.foreground':                    '#d4e8ff',
    'input.placeholderForeground':         '#233650',
    'inputOption.activeBackground':        '#1d4ed840',
    'inputOption.activeBorder':            '#3b82f6',

    // Dropdown
    'dropdown.background':                 '#060f1e',
    'dropdown.border':                     '#132847',
    'dropdown.foreground':                 '#7da6d4',
    'dropdown.listBackground':             '#0a1628',

    // Lists
    'list.hoverBackground':                '#0e1f38',
    'list.activeSelectionBackground':      '#132847',
    'list.activeSelectionForeground':      '#d4e8ff',
    'list.inactiveSelectionBackground':    '#0a1628',
    'list.highlightForeground':            '#60a5fa',
    'list.focusHighlightForeground':       '#60a5fa',

    // Peek view
    'peekView.border':                     '#1d4ed8',
    'peekViewEditor.background':           '#060f1e',
    'peekViewEditor.matchHighlightBackground': '#f59e0b30',
    'peekViewResult.background':           '#030810',
    'peekViewResult.matchHighlightBackground': '#f59e0b20',
    'peekViewTitle.background':            '#0a1628',
    'peekViewTitleLabel.foreground':       '#d4e8ff',
    'peekViewTitleDescription.foreground': '#7da6d4',

    // Panel / Terminal
    'panel.background':                    '#030810',
    'panel.border':                        '#0e1f38',
    'panelTitle.activeForeground':         '#60a5fa',
    'panelTitle.activeBorder':             '#3b82f6',
    'panelTitle.inactiveForeground':       '#4270a0',
    'terminal.background':                 '#030810',
    'terminal.foreground':                 '#d4e8ff',
    'terminal.ansiBlue':                   '#60a5fa',
    'terminal.ansiCyan':                   '#22d3ee',
    'terminal.ansiGreen':                  '#4ade80',
    'terminal.ansiRed':                    '#f87171',
    'terminal.ansiYellow':                 '#fbbf24',

    // Status bar
    'statusBar.background':                '#1d4ed8',
    'statusBar.foreground':                '#ffffff',
    'statusBar.noFolderBackground':        '#1e3a5f',
    'statusBar.debuggingBackground':       '#f59e0b',

    // Activity bar
    'activityBar.background':             '#030810',
    'activityBar.foreground':             '#d4e8ff',
    'activityBar.border':                 '#0e1f38',
    'activityBarBadge.background':        '#3b82f6',
    'activityBarBadge.foreground':        '#ffffff',

    // Sidebar
    'sideBar.background':                  '#060f1e',
    'sideBar.border':                      '#0e1f38',
    'sideBar.foreground':                  '#7da6d4',
    'sideBarTitle.foreground':             '#d4e8ff',
    'sideBarSectionHeader.background':     '#0a1628',
    'sideBarSectionHeader.foreground':     '#7da6d4',
    'sideBarSectionHeader.border':         '#0e1f38',

    // Tab bar
    'editorGroupHeader.tabsBackground':    '#060f1e',
    'editorGroupHeader.border':            '#0e1f38',
    'tab.activeBackground':                '#030810',
    'tab.activeForeground':                '#d4e8ff',
    'tab.inactiveBackground':              '#060f1e',
    'tab.inactiveForeground':              '#4270a0',
    'tab.border':                          '#0e1f38',
    'tab.activeBorderTop':                 '#3b82f6',

    // Notifications
    'notificationCenter.border':           '#132847',
    'notifications.background':            '#060f1e',
    'notifications.border':                '#132847',
    'notifications.foreground':            '#d4e8ff',

    // Badges
    'badge.background':                    '#1d4ed8',
    'badge.foreground':                    '#ffffff',

    // Buttons
    'button.background':                   '#1d4ed8',
    'button.foreground':                   '#ffffff',
    'button.hoverBackground':              '#2563eb',
  },
};

export function registerMonacoTheme(monaco: typeof import('monaco-editor')): void {
  monaco.editor.defineTheme('midnight', MIDNIGHT_THEME);
}
