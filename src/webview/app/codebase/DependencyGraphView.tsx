import React from 'react';
import type { DependencyGraph } from '../../../codebase/codebaseTypes';

interface Props {
  graph: DependencyGraph;
  onNodeClick?: (file: string) => void;
}

export function DependencyGraphView({ graph, onNodeClick }: Props) {
  if (graph.nodes.length === 0) {
    return <div style={styles.empty}>No dependencies found</div>;
  }

  // Circular layout for nodes
  const width = 700, height = 500;
  const cx = width / 2, cy = height / 2;
  const radius = Math.min(200, graph.nodes.length * 12);

  const positions = new Map<string, { x: number; y: number }>();
  graph.nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / graph.nodes.length - Math.PI / 2;
    positions.set(node, {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  });

  // Separate internal vs external
  const internalNodes = graph.nodes.filter((n) => n.includes('/') || n.includes('.'));
  const externalNodes = graph.nodes.filter((n) => !n.includes('/') && !n.includes('.'));

  return (
    <div style={styles.container}>
      <div style={styles.header}>Dependency Graph ({graph.nodes.length} modules, {graph.edges.length} imports)</div>
      <div style={styles.legend}>
        <span style={styles.legendItem}><span style={{ ...styles.dot, background: '#007acc' }} /> Internal</span>
        <span style={styles.legendItem}><span style={{ ...styles.dot, background: '#e67e22' }} /> External</span>
      </div>
      <svg width={width} height={height} style={styles.svg}>
        <defs>
          <marker id="dep-arrow" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
            <polygon points="0 0, 6 2, 0 4" fill="var(--vscode-foreground)" opacity="0.3" />
          </marker>
        </defs>
        {graph.edges.map((e, i) => {
          const p1 = positions.get(e.from);
          const p2 = positions.get(e.to);
          if (!p1 || !p2) return null;
          return (
            <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke="var(--vscode-foreground)" strokeWidth={0.8} opacity={0.15}
              markerEnd="url(#dep-arrow)" />
          );
        })}
        {graph.nodes.map((node, i) => {
          const pos = positions.get(node)!;
          const isExternal = externalNodes.includes(node);
          const label = node.length > 20 ? '...' + node.slice(-18) : node;
          return (
            <g key={i} onClick={() => onNodeClick?.(node)} style={{ cursor: 'pointer' }}>
              <circle cx={pos.x} cy={pos.y} r={6}
                fill={isExternal ? '#e67e22' : '#007acc'} />
              <text x={pos.x + 10} y={pos.y + 4} fontSize={9}
                fill="var(--vscode-editor-foreground)" opacity={0.8}
                fontFamily="var(--vscode-editor-font-family)">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 12, overflow: 'auto', height: '100%' },
  header: { fontSize: 14, fontWeight: 700, marginBottom: 8 },
  legend: { display: 'flex', gap: 16, marginBottom: 12, fontSize: 11 },
  legendItem: { display: 'flex', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },
  svg: { display: 'block', overflow: 'visible' },
  empty: { textAlign: 'center' as const, padding: 40, opacity: 0.5 },
};
