import React from 'react';
import type { TrackedVariable } from '../../../instrumenter/traceSchema';

interface Props {
  variable: TrackedVariable;
}

export function LinkedListRenderer({ variable }: Props) {
  const nodes = flattenLinkedList(variable.value);

  return (
    <div style={styles.wrapper}>
      <div style={styles.varName}>{variable.name}</div>
      <div style={styles.row}>
        {nodes.map((node, i) => (
          <React.Fragment key={i}>
            <div style={styles.node}>
              <div style={styles.val}>{String(node.val ?? node.value ?? '?')}</div>
            </div>
            {i < nodes.length - 1 && <div style={styles.arrow}>→</div>}
          </React.Fragment>
        ))}
        <div style={styles.nullTerm}>null</div>
      </div>
    </div>
  );
}

function flattenLinkedList(head: any, maxNodes = 50): any[] {
  const nodes: any[] = [];
  const seen = new Set();
  let current = head;
  while (current && typeof current === 'object' && nodes.length < maxNodes) {
    if (seen.has(current)) {
      nodes.push({ val: '(cycle)' });
      break;
    }
    seen.add(current);
    nodes.push(current);
    current = current.next;
  }
  return nodes;
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { marginBottom: 12 },
  varName: {
    fontSize: 12, fontWeight: 600,
    fontFamily: 'var(--vscode-editor-font-family)',
    marginBottom: 4, color: 'var(--vscode-charts-blue, #007acc)',
  },
  row: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 },
  node: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 40, height: 32, borderRadius: 6,
    border: '2px solid var(--vscode-charts-blue, #007acc)',
    background: 'var(--vscode-editor-background)',
    fontFamily: 'var(--vscode-editor-font-family)', fontSize: 13, fontWeight: 600,
  },
  val: {},
  arrow: {
    fontSize: 18, color: 'var(--vscode-charts-blue, #007acc)', fontWeight: 700, margin: '0 2px',
  },
  nullTerm: {
    fontSize: 11, opacity: 0.5, fontStyle: 'italic', marginLeft: 4,
  },
};
