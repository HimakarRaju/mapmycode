import React from 'react';
import type { TrackedVariable } from '../../../instrumenter/traceSchema';

interface VariablesPanelProps {
  variables: TrackedVariable[];
}

export function VariablesPanel({ variables }: VariablesPanelProps) {
  if (!variables || variables.length === 0) {
    return <div style={styles.empty}>No variables in scope</div>;
  }

  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>Name</th>
          <th style={styles.th}>Value</th>
          <th style={styles.th}>Type</th>
        </tr>
      </thead>
      <tbody>
        {variables.map((v, i) => (
          <tr key={`${v.name}-${i}`}>
            <td style={styles.tdName}>{v.name}</td>
            <td style={styles.tdValue}>{formatValue(v.value)}</td>
            <td style={styles.tdType}>{v.dsType}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatValue(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (Array.isArray(value)) {
    if (value.length > 20) {
      return `[${value.slice(0, 20).join(', ')}, ...${value.length - 20} more]`;
    }
    return `[${value.join(', ')}]`;
  }
  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    if (json.length > 100) return json.slice(0, 100) + '...';
    return json;
  }
  return String(value);
}

const styles: Record<string, React.CSSProperties> = {
  table: {
    borderCollapse: 'collapse' as const,
    width: '100%',
    fontSize: 12,
    fontFamily: 'var(--vscode-editor-font-family)',
  },
  th: {
    textAlign: 'left' as const,
    padding: '4px 8px',
    borderBottom: '1px solid var(--vscode-panel-border)',
    fontWeight: 600,
    fontSize: 11,
    opacity: 0.7,
    textTransform: 'uppercase' as const,
  },
  tdName: {
    padding: '3px 8px',
    color: 'var(--vscode-charts-blue, #007acc)',
    fontWeight: 500,
  },
  tdValue: {
    padding: '3px 8px',
    maxWidth: 300,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  tdType: {
    padding: '3px 8px',
    opacity: 0.6,
    fontSize: 11,
  },
  empty: {
    opacity: 0.5,
    padding: 8,
    fontSize: 12,
  },
};
