import React from 'react';

interface CodePaneProps {
  code: string;
  activeLine: number | null;
  language: string;
  onLineClick?: (line: number) => void;
}

export function CodePane({ code, activeLine, language, onLineClick }: CodePaneProps) {
  if (!code) {
    return (
      <div style={styles.empty}>
        <p>No code loaded</p>
      </div>
    );
  }

  const lines = code.split('\n');

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.langBadge}>{language}</span>
      </div>
      <div style={styles.codeArea}>
        <table style={styles.table}>
          <tbody>
            {lines.map((line, i) => {
              const lineNum = i + 1;
              const isActive = activeLine === lineNum;
              return (
                <tr
                  key={i}
                  style={isActive ? styles.activeLine : styles.hoverLine}
                  data-line={lineNum}
                  onClick={() => onLineClick?.(lineNum)}
                >
                  <td style={styles.lineNumber}>{lineNum}</td>
                  <td style={styles.lineCode}>
                    <pre style={styles.pre}>{line || ' '}</pre>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: {
    padding: '6px 12px',
    borderBottom: '1px solid var(--vscode-panel-border)',
    display: 'flex',
    alignItems: 'center',
  },
  langBadge: {
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 3,
    background: 'var(--vscode-badge-background)',
    color: 'var(--vscode-badge-foreground)',
    textTransform: 'uppercase' as const,
  },
  codeArea: {
    flex: 1,
    overflow: 'auto',
    padding: '4px 0',
  },
  table: {
    borderCollapse: 'collapse' as const,
    width: '100%',
    fontFamily: 'var(--vscode-editor-font-family, monospace)',
    fontSize: 'var(--vscode-editor-font-size, 13px)',
  },
  lineNumber: {
    textAlign: 'right' as const,
    padding: '0 12px 0 8px',
    color: 'var(--vscode-editorLineNumber-foreground)',
    userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
    width: 1,
    verticalAlign: 'top',
  },
  lineCode: {
    padding: '0 8px',
    whiteSpace: 'pre' as const,
  },
  pre: {
    margin: 0,
    fontFamily: 'inherit',
    fontSize: 'inherit',
  },
  activeLine: {
    background: 'var(--vscode-editor-selectionBackground, rgba(0, 120, 215, 0.3))',
  },
  hoverLine: {
    cursor: 'pointer',
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    opacity: 0.5,
  },
};
