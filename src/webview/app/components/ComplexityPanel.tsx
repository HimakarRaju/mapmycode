import React from 'react';
import type { ComplexityResult } from '../../../features/complexityAnalyzer';

interface Props {
  result: ComplexityResult;
}

export function ComplexityPanel({ result }: Props) {
  return (
    <div style={styles.panel}>
      <div style={styles.header}>Complexity Analysis</div>
      <div style={styles.row}>
        <div style={styles.metric}>
          <div style={styles.label}>Time</div>
          <div style={styles.value}>{result.time}</div>
        </div>
        <div style={styles.metric}>
          <div style={styles.label}>Space</div>
          <div style={styles.value}>{result.space}</div>
        </div>
      </div>
      <div style={styles.details}>
        {result.explanation}
      </div>
      <div style={styles.tags}>
        {result.recursionDetected && <span style={styles.tag}>Recursive</span>}
        {result.loopDepth > 0 && <span style={styles.tag}>Loop depth: {result.loopDepth}</span>}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    padding: 12,
    borderTop: '1px solid var(--vscode-panel-border)',
    background: 'var(--vscode-sideBar-background)',
  },
  header: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    opacity: 0.6,
    marginBottom: 8,
    letterSpacing: '0.5px',
  },
  row: {
    display: 'flex',
    gap: 24,
    marginBottom: 8,
  },
  metric: {},
  label: {
    fontSize: 10,
    opacity: 0.5,
    textTransform: 'uppercase' as const,
  },
  value: {
    fontSize: 18,
    fontWeight: 700,
    fontFamily: 'var(--vscode-editor-font-family)',
    color: 'var(--vscode-charts-blue, #007acc)',
  },
  details: {
    fontSize: 11,
    opacity: 0.7,
    marginBottom: 6,
  },
  tags: {
    display: 'flex',
    gap: 6,
  },
  tag: {
    fontSize: 10,
    padding: '1px 6px',
    borderRadius: 3,
    border: '1px solid var(--vscode-panel-border)',
    opacity: 0.8,
  },
};
