import React from 'react';
import type { TrackedVariable } from '../../../instrumenter/traceSchema';

interface Props {
  variable: TrackedVariable;
}

export function GraphRenderer({ variable }: Props) {
  const { nodes, edges } = parseGraph(variable.value);
  if (nodes.length === 0) return null;

  // Scalable circular layout
  const radius = Math.max(120, nodes.length * 18);
  const cx = radius + 80;
  const cy = radius + 80;
  
  const positions = nodes.map((_, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
  const nodeMap = new Map(nodes.map((n, i) => [n, i]));

  return (
    <div style={styles.wrapper}>
      <div style={styles.varName}>{variable.name}</div>
      <div style={styles.svgContainer}>
        <svg width={cx * 2} height={cy * 2} style={styles.svg}>
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="var(--vscode-foreground)" opacity="0.5" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const fromIdx = nodeMap.get(e.from);
            const toIdx = nodeMap.get(e.to);
            if (fromIdx === undefined || toIdx === undefined) return null;
            const p1 = positions[fromIdx], p2 = positions[toIdx];
            const dx = p2.x - p1.x, dy = p2.y - p1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist === 0) return null;
            const offset = 22 / dist;
            return (
              <line key={i}
                x1={p1.x + dx * offset} y1={p1.y + dy * offset}
                x2={p2.x - dx * offset} y2={p2.y - dy * offset}
                stroke="var(--vscode-foreground)" strokeWidth={1.5} opacity={0.35}
                markerEnd="url(#arrowhead)"
              />
            );
          })}
          {nodes.map((label, i) => {
            const shortLabel = label.length > 12 ? label.substring(0, 10) + '...' : label;
            return (
              <g key={i} transform={`translate(${positions[i].x}, ${positions[i].y})`}>
                <title>{label}</title>
                <circle r={22} fill="var(--vscode-editor-background)"
                  stroke="var(--vscode-charts-orange, #e67e22)" strokeWidth={2} />
                <text textAnchor="middle" dy="4" fontSize={11} fontWeight={600}
                  fill="var(--vscode-editor-foreground)" fontFamily="var(--vscode-editor-font-family)">
                  {shortLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function parseGraph(value: any): { nodes: string[]; edges: { from: string; to: string }[] } {
  const nodes = new Set<string>();
  const edges: { from: string; to: string }[] = [];

  if (!value || typeof value !== 'object') return { nodes: [], edges: [] };

  // Adjacency list: { A: ['B', 'C'], B: ['D'], ... }
  if (!Array.isArray(value)) {
    for (const key of Object.keys(value)) {
      nodes.add(String(key));
      const neighbors = value[key];
      if (Array.isArray(neighbors)) {
        for (const n of neighbors) {
          nodes.add(String(n));
          edges.push({ from: String(key), to: String(n) });
        }
      }
    }
  }

  // Adjacency matrix: number[][]
  if (Array.isArray(value) && value.length > 0 && Array.isArray(value[0])) {
    for (let i = 0; i < value.length; i++) {
      nodes.add(String(i));
      for (let j = 0; j < value[i].length; j++) {
        if (value[i][j]) {
          nodes.add(String(j));
          edges.push({ from: String(i), to: String(j) });
        }
      }
    }
  }

  return { nodes: Array.from(nodes), edges };
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { marginBottom: 12 },
  varName: {
    fontSize: 12, fontWeight: 600,
    fontFamily: 'var(--vscode-editor-font-family)',
    marginBottom: 4, color: 'var(--vscode-charts-orange, #e67e22)',
  },
  svgContainer: {
    width: '100%',
    overflowX: 'auto',
    overflowY: 'hidden',
  },
  svg: { display: 'block', overflow: 'visible' },
};
