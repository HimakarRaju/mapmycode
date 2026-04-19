import React from 'react';
import type { TrackedVariable } from '../../../instrumenter/traceSchema';

interface Props {
  variable: TrackedVariable;
}

interface TreeNodeData {
  val: any;
  left?: TreeNodeData | null;
  right?: TreeNodeData | null;
}

interface FlatNode {
  val: any;
  x: number;
  y: number;
  left?: FlatNode | null;
  right?: FlatNode | null;
}

export function BinaryTreeRenderer({ variable }: Props) {
  const root = variable.value as TreeNodeData;
  if (!root || typeof root !== 'object') return null;

  const { nodes, edges, width, height } = layoutTree(root);

  return (
    <div style={styles.wrapper}>
      <div style={styles.varName}>{variable.name}</div>
      <svg width={width + 40} height={height + 40} style={styles.svg}>
        <g transform="translate(20, 20)">
          {edges.map((e, i) => (
            <line
              key={i}
              x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
              stroke="var(--vscode-foreground)" strokeWidth={1.5} opacity={0.4}
            />
          ))}
          {nodes.map((n, i) => (
            <g key={i} transform={`translate(${n.x}, ${n.y})`}>
              <circle r={18} fill="var(--vscode-editor-background)"
                stroke="var(--vscode-charts-purple, #9b59b6)" strokeWidth={2} />
              <text textAnchor="middle" dy="5" fontSize={12} fontWeight={600}
                fill="var(--vscode-editor-foreground)" fontFamily="var(--vscode-editor-font-family)">
                {String(n.val)}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

function layoutTree(root: TreeNodeData) {
  const nodes: { val: any; x: number; y: number }[] = [];
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const LEVEL_GAP = 55;
  const NODE_GAP = 42;

  // Assign positions using in-order traversal for x, level for y
  let inorderIdx = 0;
  function traverse(node: TreeNodeData | null | undefined, level: number, parent?: { x: number; y: number }) {
    if (!node || typeof node !== 'object') return;

    traverse(node.left, level + 1);

    const x = inorderIdx * NODE_GAP;
    const y = level * LEVEL_GAP;
    nodes.push({ val: node.val ?? '?', x, y });
    if (parent) {
      edges.push({ x1: parent.x, y1: parent.y, x2: x, y2: y });
    }
    const current = { x, y };
    inorderIdx++;

    traverse(node.right, level + 1, current);

    // Re-wire parent edges to use actual position
    // The parent→current edge should go from parent to current
    // but left child was traversed before us, so fix the parent edge for left
    // Actually the edge was already added for left in its own call
    // We need to re-add parent edge for left child
  }

  // Better approach: BFS with position calculation
  nodes.length = 0;
  edges.length = 0;
  inorderIdx = 0;

  function inorder(node: TreeNodeData | null | undefined): number {
    if (!node || typeof node !== 'object') return -1;
    inorder(node.left);
    const idx = inorderIdx++;
    (node as any).__idx = idx;
    inorder(node.right);
    return idx;
  }
  inorder(root);

  function buildLayout(node: TreeNodeData | null | undefined, level: number) {
    if (!node || typeof node !== 'object') return;
    const x = ((node as any).__idx as number) * NODE_GAP;
    const y = level * LEVEL_GAP;
    nodes.push({ val: node.val ?? '?', x, y });

    if (node.left && typeof node.left === 'object') {
      const lx = ((node.left as any).__idx as number) * NODE_GAP;
      const ly = (level + 1) * LEVEL_GAP;
      edges.push({ x1: x, y1: y, x2: lx, y2: ly });
      buildLayout(node.left, level + 1);
    }
    if (node.right && typeof node.right === 'object') {
      const rx = ((node.right as any).__idx as number) * NODE_GAP;
      const ry = (level + 1) * LEVEL_GAP;
      edges.push({ x1: x, y1: y, x2: rx, y2: ry });
      buildLayout(node.right, level + 1);
    }
  }
  buildLayout(root, 0);

  const maxX = nodes.reduce((m, n) => Math.max(m, n.x), 0);
  const maxY = nodes.reduce((m, n) => Math.max(m, n.y), 0);

  return { nodes, edges, width: maxX + 40, height: maxY + 40 };
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { marginBottom: 12 },
  varName: {
    fontSize: 12, fontWeight: 600,
    fontFamily: 'var(--vscode-editor-font-family)',
    marginBottom: 4, color: 'var(--vscode-charts-purple, #9b59b6)',
  },
  svg: { display: 'block', overflow: 'visible' },
};
