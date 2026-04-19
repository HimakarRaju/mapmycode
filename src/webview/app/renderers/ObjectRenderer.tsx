import React from 'react';
import type { TrackedVariable } from '../../../instrumenter/traceSchema';

interface Props {
  variable: TrackedVariable;
}

export function ObjectRenderer({ variable }: Props) {
  const entries = getEntries(variable.value);
  if (entries.length === 0) {
    return null;
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.varName}>{variable.name}</div>
      <div style={styles.card}>
        {entries.map(({ key, value }, index) => (
          <div key={index} style={styles.row}>
            <span style={styles.key}>{key}</span>
            <span style={styles.value}>{formatValue(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getEntries(value: any): Array<{ key: string; value: any }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value)
    .slice(0, 20)
    .map(([key, entryValue]) => ({ key, value: entryValue }));
}

function formatValue(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return `[${value.slice(0, 6).map(formatValue).join(', ')}${value.length > 6 ? ', ...' : ''}]`;
  }
  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 80 ? `${serialized.slice(0, 77)}...` : serialized;
  } catch {
    return '[Object]';
  }
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { marginBottom: 12 },
  varName: {
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'var(--vscode-editor-font-family)',
    marginBottom: 4,
    color: 'var(--vscode-charts-green, #4ec9b0)',
  },
  card: {
    border: '1px solid var(--vscode-panel-border)',
    borderRadius: 8,
    background: 'var(--vscode-editor-background)',
    overflow: 'hidden',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(120px, 180px) 1fr',
    gap: 10,
    padding: '6px 10px',
    borderBottom: '1px solid var(--vscode-panel-border)',
    fontFamily: 'var(--vscode-editor-font-family)',
    fontSize: 12,
  },
  key: { fontWeight: 700, opacity: 0.9 },
  value: { opacity: 0.78, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
};