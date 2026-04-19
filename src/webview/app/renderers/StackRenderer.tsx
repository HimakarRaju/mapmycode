import React from 'react';
import type { TrackedVariable } from '../../../instrumenter/traceSchema';

interface Props {
  variable: TrackedVariable;
}

/** Vertical stack — top of stack at top of display. */
export function StackRenderer({ variable }: Props) {
  const arr = variable.value;
  if (!Array.isArray(arr)) return null;

  // Display top-to-bottom (index arr.length-1 at top)
  const items = [...arr].reverse();

  return (
    <div style={styles.wrapper}>
      <div style={styles.varName}>{variable.name} (stack)</div>
      <div style={styles.stack}>
        {items.map((val, i) => (
          <div key={i} style={{
            ...styles.cell,
            ...(i === 0 ? styles.topCell : {}),
          }}>
            <span style={styles.label}>{i === 0 ? 'TOP' : ''}</span>
            <span style={styles.value}>{String(val)}</span>
            <span style={styles.idx}>{arr.length - 1 - i}</span>
          </div>
        ))}
        {arr.length === 0 && <div style={styles.emptyLabel}>empty</div>}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { marginBottom: 12 },
  varName: {
    fontSize: 12, fontWeight: 600,
    fontFamily: 'var(--vscode-editor-font-family)',
    marginBottom: 4, color: 'var(--vscode-charts-green, #27ae60)',
  },
  stack: {
    display: 'flex', flexDirection: 'column', width: 120,
    border: '2px solid var(--vscode-charts-green, #27ae60)',
    borderTop: 'none', borderRadius: '0 0 4px 4px',
  },
  cell: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '4px 8px', borderTop: '1px solid var(--vscode-panel-border)',
    fontFamily: 'var(--vscode-editor-font-family)', fontSize: 13,
  },
  topCell: {
    background: 'var(--vscode-charts-green, #27ae60)',
    color: '#fff', fontWeight: 700,
    borderTop: '2px solid var(--vscode-charts-green, #27ae60)',
  },
  label: { fontSize: 9, fontWeight: 700, width: 24 },
  value: { flex: 1, textAlign: 'center' as const },
  idx: { fontSize: 10, opacity: 0.5, width: 16, textAlign: 'right' as const },
  emptyLabel: { textAlign: 'center' as const, padding: 12, opacity: 0.4, fontSize: 12 },
};
