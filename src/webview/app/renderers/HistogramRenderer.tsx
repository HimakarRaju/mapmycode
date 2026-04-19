import React from 'react';
import type { TrackedVariable } from '../../../instrumenter/traceSchema';

interface Props {
  variable: TrackedVariable;
}

/** Renders 1D array as vertical histogram bars. Used when @hist annotation is present. */
export function HistogramRenderer({ variable }: Props) {
  const arr = variable.value;
  if (!Array.isArray(arr) || arr.length === 0) return null;

  const nums = arr.map((v) => (typeof v === 'number' ? v : parseFloat(v) || 0));
  const max = Math.max(...nums, 1);
  const barMaxHeight = 120;

  return (
    <div style={styles.wrapper}>
      <div style={styles.varName}>{variable.name} (histogram)</div>
      <div style={styles.chart}>
        {nums.map((val, i) => {
          const height = Math.max(2, (val / max) * barMaxHeight);
          return (
            <div key={i} style={styles.barCol}>
              <div style={styles.barValue}>{val}</div>
              <div style={{
                ...styles.bar,
                height,
                backgroundColor: `hsl(${210 + (i * 15) % 120}, 65%, 55%)`,
              }} />
              <div style={styles.barIdx}>{i}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { marginBottom: 12 },
  varName: {
    fontSize: 12, fontWeight: 600,
    fontFamily: 'var(--vscode-editor-font-family)',
    marginBottom: 4, color: 'var(--vscode-charts-blue, #007acc)',
  },
  chart: {
    display: 'flex', alignItems: 'flex-end', gap: 3,
    padding: '8px 0', minHeight: 140,
  },
  barCol: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 2,
  },
  barValue: { fontSize: 10, opacity: 0.7 },
  bar: {
    width: 28, borderRadius: '3px 3px 0 0',
    transition: 'height 0.3s ease',
  },
  barIdx: { fontSize: 9, opacity: 0.5 },
};
