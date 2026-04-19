import React from 'react';
import type { TrackedVariable } from '../../../instrumenter/traceSchema';

interface Props {
  variable: TrackedVariable;
}

/** Visualizes a HashMap/Map/object as key-value buckets. */
export function HashMapRenderer({ variable }: Props) {
  const entries = getEntries(variable.value);
  if (entries.length === 0) return null;

  return (
    <div style={styles.wrapper}>
      <div style={styles.varName}>{variable.name}</div>
      <div style={styles.grid}>
        {entries.map(({ key, value }, i) => (
          <div key={i} style={styles.entry}>
            <div style={styles.key}>{String(key)}</div>
            <div style={styles.arrow}>→</div>
            <div style={styles.val}>{formatValue(value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getEntries(value: any): { key: string; value: any }[] {
  if (!value || typeof value !== 'object') return [];
  if (value instanceof Map || (value && value.__mapEntries)) {
    // Serialized map
    return Object.entries(value).map(([k, v]) => ({ key: k, value: v }));
  }
  return Object.entries(value).map(([k, v]) => ({ key: k, value: v }));
}

function formatValue(val: any): string {
  if (val === null || val === undefined) return String(val);
  if (typeof val === 'object') {
    try { return JSON.stringify(val).slice(0, 60); } catch { return '[Object]'; }
  }
  return String(val);
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { marginBottom: 12 },
  varName: {
    fontSize: 12, fontWeight: 600,
    fontFamily: 'var(--vscode-editor-font-family)',
    marginBottom: 4, color: 'var(--vscode-charts-red, #e74c3c)',
  },
  grid: { display: 'flex', flexDirection: 'column' as const, gap: 2 },
  entry: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '3px 8px', borderRadius: 4,
    border: '1px solid var(--vscode-panel-border)',
    fontFamily: 'var(--vscode-editor-font-family)', fontSize: 12,
  },
  key: { fontWeight: 700, minWidth: 50 },
  arrow: { opacity: 0.4, fontSize: 14 },
  val: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
};
