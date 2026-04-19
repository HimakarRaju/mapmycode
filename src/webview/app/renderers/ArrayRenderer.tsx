import React from 'react';
import type { TrackedVariable } from '../../../instrumenter/traceSchema';

interface ArrayRendererProps {
  variable: TrackedVariable;
}

export function ArrayRenderer({ variable }: ArrayRendererProps) {
  const arr = variable.value;
  if (!Array.isArray(arr)) return null;

  // Check for 2D array
  if (arr.length > 0 && Array.isArray(arr[0])) {
    return <Array2DRenderer name={variable.name} grid={arr} />;
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.varName}>{variable.name}</div>
      <div style={styles.arrayRow}>
        {arr.map((val, i) => (
          <div key={i} style={styles.cell}>
            <div style={styles.index}>{i}</div>
            <div style={styles.value}>{String(val)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Array2DRenderer({ name, grid }: { name: string; grid: any[][] }) {
  return (
    <div style={styles.wrapper}>
      <div style={styles.varName}>{name}</div>
      <div style={styles.grid}>
        {grid.map((row, r) => (
          <div key={r} style={styles.gridRow}>
            {row.map((val, c) => (
              <div key={c} style={styles.cell}>
                <div style={styles.value}>{String(val)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    marginBottom: 12,
  },
  varName: {
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'var(--vscode-editor-font-family)',
    marginBottom: 4,
    color: 'var(--vscode-charts-blue, #007acc)',
  },
  arrayRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 2,
  },
  gridRow: {
    display: 'flex',
    gap: 2,
  },
  grid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  cell: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 36,
    minHeight: 36,
    border: '1px solid var(--vscode-panel-border)',
    borderRadius: 3,
    padding: '2px 6px',
    background: 'var(--vscode-input-background)',
    fontFamily: 'var(--vscode-editor-font-family)',
    fontSize: 13,
  },
  index: {
    fontSize: 9,
    opacity: 0.5,
    lineHeight: 1,
  },
  value: {
    fontWeight: 500,
  },
};
