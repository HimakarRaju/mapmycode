import React from 'react';
import type { TrackedVariable } from '../../../instrumenter/traceSchema';

interface Props {
  variable: TrackedVariable;
}

/** Renders a Set as a tag cloud / chip list. */
export function SetRenderer({ variable }: Props) {
  const items = getSetItems(variable.value);
  if (items.length === 0) return null;

  return (
    <div style={styles.wrapper}>
      <div style={styles.varName}>{variable.name} (Set)</div>
      <div style={styles.chips}>
        {items.map((item, i) => (
          <div key={i} style={styles.chip}>{String(item)}</div>
        ))}
      </div>
    </div>
  );
}

function getSetItems(value: any): any[] {
  if (Array.isArray(value)) return value; // serialized Set
  if (value instanceof Set) return Array.from(value);
  return [];
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { marginBottom: 12 },
  varName: {
    fontSize: 12, fontWeight: 600,
    fontFamily: 'var(--vscode-editor-font-family)',
    marginBottom: 4, color: 'var(--vscode-charts-blue, #3498db)',
  },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  chip: {
    padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500,
    border: '1px solid var(--vscode-charts-blue, #3498db)',
    fontFamily: 'var(--vscode-editor-font-family)',
  },
};
