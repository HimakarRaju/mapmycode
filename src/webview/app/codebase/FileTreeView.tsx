import React from 'react';
import type { FileNode } from '../../../codebase/codebaseTypes';

interface Props {
  root: FileNode;
  onFileClick?: (path: string) => void;
}

export function FileTreeView({ root, onFileClick }: Props) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>File Structure</div>
      <div style={styles.tree}>
        <TreeNode node={root} depth={0} onFileClick={onFileClick} />
      </div>
    </div>
  );
}

function TreeNode({ node, depth, onFileClick }: { node: FileNode; depth: number; onFileClick?: (p: string) => void }) {
  const [expanded, setExpanded] = React.useState(depth < 2);
  const isDir = node.type === 'directory';
  const icon = isDir ? (expanded ? '📂' : '📁') : getFileIcon(node.language);

  return (
    <div>
      <div
        style={{ ...styles.row, paddingLeft: depth * 16 + 4 }}
        onClick={() => {
          if (isDir) setExpanded(!expanded);
          else onFileClick?.(node.path);
        }}
      >
        <span style={styles.icon}>{icon}</span>
        <span style={styles.name}>{node.name}</span>
        <span style={styles.size}>{formatSize(node.size)}</span>
      </div>
      {isDir && expanded && node.children?.map((child, i) => (
        <TreeNode key={i} node={child} depth={depth + 1} onFileClick={onFileClick} />
      ))}
    </div>
  );
}

function getFileIcon(lang?: string): string {
  const map: Record<string, string> = {
    javascript: '🟨', typescript: '🔷', python: '🐍', java: '☕',
    css: '🎨', html: '🌐', json: '📋', markdown: '📝',
  };
  return lang ? (map[lang] || '📄') : '📄';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 8, overflow: 'auto', height: '100%' },
  header: {
    fontSize: 14, fontWeight: 700, marginBottom: 12, padding: '0 4px',
  },
  tree: { fontFamily: 'var(--vscode-editor-font-family)', fontSize: 13 },
  row: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '2px 4px', cursor: 'pointer', borderRadius: 3,
  },
  icon: { fontSize: 14, width: 18, textAlign: 'center' as const },
  name: { flex: 1 },
  size: { fontSize: 11, opacity: 0.5 },
};
