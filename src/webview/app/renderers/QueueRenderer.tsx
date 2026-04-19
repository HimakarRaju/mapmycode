import React from 'react';
import type { TrackedVariable } from '../../../instrumenter/traceSchema';

interface Props {
  variable: TrackedVariable;
}

/** Horizontal queue — front on left, rear on right. */
export function QueueRenderer({ variable }: Props) {
  const arr = variable.value;
  if (!Array.isArray(arr)) return null;

  return (
    <div style={styles.wrapper}>
      <div style={styles.varName}>{variable.name} (queue)</div>
      <div style={styles.queue}>
        {arr.length > 0 && <div style={styles.marker}>FRONT</div>}
        {arr.map((val, i) => (
          <div key={i} style={{
            ...styles.cell,
            ...(i === 0 ? styles.frontCell : {}),
            ...(i === arr.length - 1 ? styles.rearCell : {}),
          }}>
            <div style={styles.value}>{String(val)}</div>
            <div style={styles.idx}>{i}</div>
          </div>
        ))}
        {arr.length > 0 && <div style={styles.marker}>REAR</div>}
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
    marginBottom: 4, color: 'var(--vscode-charts-yellow, #f39c12)',
  },
  queue: {
    display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
  },
  marker: {
    fontSize: 9, fontWeight: 700, opacity: 0.6,
    writingMode: 'vertical-rl' as const, transform: 'rotate(180deg)',
    letterSpacing: '1px',
  },
  cell: {
    display: 'flex', flexDirection: 'column' as const,
    alignItems: 'center', justifyContent: 'center',
    width: 40, height: 40,
    border: '2px solid var(--vscode-charts-yellow, #f39c12)',
    borderRadius: 4,
    fontFamily: 'var(--vscode-editor-font-family)', fontSize: 13,
  },
  frontCell: {
    background: 'var(--vscode-charts-yellow, #f39c12)', color: '#fff', fontWeight: 700,
  },
  rearCell: {
    borderStyle: 'dashed',
  },
  value: {},
  idx: { fontSize: 9, opacity: 0.5 },
  emptyLabel: { padding: 12, opacity: 0.4, fontSize: 12 },
};
