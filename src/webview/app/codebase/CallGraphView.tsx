import React, { useMemo } from 'react';
import type { CallGraph } from '../../../codebase/codebaseTypes';

interface Props {
  graph: CallGraph;
  onNodeClick?: (file: string, line: number) => void;
}

interface LayoutNode {
  id: string;
  name: string;
  file: string;
  line: number;
  x: number;
  y: number;
  degree: number;
  color: string;
  fileLabel: string;
}

interface LayoutLink {
  source: LayoutNode;
  target: LayoutNode;
}

interface FileBlock {
  file: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function CallGraphView({ graph, onNodeClick }: Props) {
  const layout = useMemo(() => buildLayout(graph), [graph]);

  if (layout.nodes.length === 0) {
    return <div style={styles.empty}>No callable relationships found</div>;
  }

  const files = new Set(layout.nodes.map((node) => node.file));

  return (
    <div style={styles.container}>
      <div style={styles.header}>Call Graph ({layout.nodes.length} functions, {layout.links.length} call edges, {files.size} files)</div>
      <div style={styles.caption}>Static call graph built from workspace source. Click a node to open its definition.</div>
      <div style={styles.canvasWrap}>
        <svg width={layout.width} height={layout.height} style={styles.svg}>
          <defs>
            <marker id="call-arrow" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
              <polygon points="0 0, 7 2.5, 0 5" fill="var(--vscode-foreground)" opacity="0.35" />
            </marker>
          </defs>
          {layout.fileBlocks.map((block) => (
            <g key={block.file}>
              <rect
                x={block.x}
                y={block.y}
                width={block.width}
                height={block.height}
                rx={12}
                fill="rgba(255,255,255,0.02)"
                stroke="rgba(255,255,255,0.08)"
              />
              <text
                x={block.x + 14}
                y={block.y + 22}
                fill="var(--vscode-editor-foreground)"
                fontFamily="var(--vscode-font-family)"
                fontSize={12}
                fontWeight={700}
                opacity={0.82}
              >
                {block.label}
              </text>
            </g>
          ))}
          {layout.links.map((link, index) => {
            const controlX = (link.source.x + link.target.x) / 2;
            const controlY = Math.min(link.source.y, link.target.y) - Math.abs(link.source.x - link.target.x) * 0.08;

            return (
              <path
                key={index}
                d={`M ${link.source.x} ${link.source.y} Q ${controlX} ${controlY} ${link.target.x} ${link.target.y}`}
                stroke="var(--vscode-foreground)"
                strokeWidth={1}
                opacity={0.14}
                fill="none"
                markerEnd="url(#call-arrow)"
              />
            );
          })}
          {layout.nodes.map((node) => (
            <g key={node.id} onClick={() => onNodeClick?.(node.file, node.line)} style={{ cursor: 'pointer' }}>
              <circle
                cx={node.x}
                cy={node.y}
                r={Math.max(7, Math.min(14, 7 + node.degree * 0.7))}
                fill={node.color}
                stroke="rgba(255,255,255,0.25)"
                strokeWidth={1}
              />
              <text
                x={node.x + 12}
                y={node.y + 4}
                fill="var(--vscode-editor-foreground)"
                fontFamily="var(--vscode-editor-font-family)"
                fontSize={11}
                opacity={0.92}
              >
                {shortenLabel(node.name)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function buildLayout(graph: CallGraph) {
  const nodeMap = new Map<string, LayoutNode>();
  const degrees = new Map<string, number>();
  const fileGroups = new Map<string, LayoutNode[]>();

  const PADDING_X = 24;
  const PADDING_Y = 24;
  const COLUMN_WIDTH = 300;
  const COLUMN_GAP = 28;
  const FILE_HEADER_HEIGHT = 34;
  const NODE_GAP = 26;
  const FILE_PADDING = 14;
  const FILE_GAP = 24;

  for (const edge of graph.edges) {
    degrees.set(edge.caller, (degrees.get(edge.caller) ?? 0) + 1);
    degrees.set(edge.callee, (degrees.get(edge.callee) ?? 0) + 1);
  }

  const nodes: LayoutNode[] = graph.nodes.map((node) => {
    const id = buildNodeId(node.file, node.name);
    const layoutNode: LayoutNode = {
      id,
      name: node.name,
      file: node.file,
      line: node.line,
      x: 0,
      y: 0,
      degree: degrees.get(id) ?? 0,
      color: colorFromFile(node.file),
      fileLabel: shortenFile(node.file),
    };
    nodeMap.set(id, layoutNode);
    const group = fileGroups.get(node.file) ?? [];
    group.push(layoutNode);
    fileGroups.set(node.file, group);
    return layoutNode;
  });

  const sortedFiles = Array.from(fileGroups.entries())
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  const columnCount = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(sortedFiles.length))));
  const columnHeights = Array.from({ length: columnCount }, () => PADDING_Y);
  const fileBlocks: FileBlock[] = [];

  for (const [file, fileNodes] of sortedFiles) {
    const columnIndex = columnHeights.indexOf(Math.min(...columnHeights));
    const x = PADDING_X + columnIndex * (COLUMN_WIDTH + COLUMN_GAP);
    const y = columnHeights[columnIndex];

    const orderedNodes = [...fileNodes].sort((left, right) => left.line - right.line || left.name.localeCompare(right.name));
    const blockHeight = FILE_HEADER_HEIGHT + FILE_PADDING * 2 + Math.max(orderedNodes.length - 1, 0) * NODE_GAP + 28;

    orderedNodes.forEach((node, index) => {
      node.x = x + 18;
      node.y = y + FILE_HEADER_HEIGHT + FILE_PADDING + index * NODE_GAP + 14;
    });

    fileBlocks.push({
      file,
      label: shortenFile(file),
      x,
      y,
      width: COLUMN_WIDTH,
      height: blockHeight,
    });

    columnHeights[columnIndex] = y + blockHeight + FILE_GAP;
  }

  const links: LayoutLink[] = graph.edges
    .map((edge) => ({
      source: nodeMap.get(edge.caller),
      target: nodeMap.get(edge.callee),
    }))
    .filter((edge): edge is LayoutLink => Boolean(edge.source && edge.target));

  const width = PADDING_X * 2 + columnCount * COLUMN_WIDTH + Math.max(0, columnCount - 1) * COLUMN_GAP;
  const height = Math.max(560, Math.max(...columnHeights) + PADDING_Y);

  return { nodes, links, nodeMap, width, height, fileBlocks };
}

function buildNodeId(file: string, name: string): string {
  return `${file}::${name}`;
}

function colorFromFile(file: string): string {
  let hash = 0;
  for (let i = 0; i < file.length; i++) {
    hash = (hash * 31 + file.charCodeAt(i)) >>> 0;
  }
  return `hsl(${hash % 360} 62% 52%)`;
}

function shortenLabel(label: string): string {
  return label.length > 28 ? `${label.slice(0, 25)}...` : label;
}

function shortenFile(file: string): string {
  return file.length > 38 ? `...${file.slice(-35)}` : file;
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 12, overflow: 'auto', height: '100%' },
  header: { fontSize: 14, fontWeight: 700, marginBottom: 4 },
  caption: { fontSize: 11, opacity: 0.7, marginBottom: 12 },
  canvasWrap: {
    height: 'calc(100% - 42px)',
    minHeight: 480,
    borderRadius: 12,
    background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.08))',
    border: '1px solid var(--vscode-panel-border)',
    overflow: 'auto',
  },
  svg: { display: 'block' },
  empty: { textAlign: 'center' as const, padding: 40, opacity: 0.5 },
};