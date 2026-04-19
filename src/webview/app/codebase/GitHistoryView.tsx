import React from 'react';
import type { GitCommit } from '../../../codebase/codebaseTypes';

interface Props {
  commits: GitCommit[];
}

export function GitHistoryView({ commits }: Props) {
  if (commits.length === 0) {
    return <div style={styles.empty}>No git history available</div>;
  }

  const maxFiles = Math.max(...commits.map((c) => c.filesChanged), 1);

  return (
    <div style={styles.container}>
      <div style={styles.header}>Git History ({commits.length} commits)</div>
      <div style={styles.timeline}>
        {commits.map((commit, i) => (
          <div key={i} style={styles.commit}>
            <div style={styles.dot} />
            <div style={styles.line} />
            <div style={styles.content}>
              <div style={styles.message}>{commit.message}</div>
              <div style={styles.meta}>
                <span style={styles.hash}>{commit.hash.slice(0, 7)}</span>
                <span style={styles.author}>{commit.author}</span>
                <span style={styles.date}>{formatDate(commit.date)}</span>
              </div>
              {commit.filesChanged > 0 && (
                <div style={styles.barRow}>
                  <div style={{
                    ...styles.bar,
                    width: `${(commit.filesChanged / maxFiles) * 100}%`,
                  }} />
                  <span style={styles.fileCount}>{commit.filesChanged} files</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 12, overflow: 'auto', height: '100%' },
  header: { fontSize: 14, fontWeight: 700, marginBottom: 12 },
  timeline: { position: 'relative' as const },
  commit: {
    display: 'flex', gap: 12, marginBottom: 8, position: 'relative' as const,
  },
  dot: {
    width: 10, height: 10, borderRadius: '50%', marginTop: 4, flexShrink: 0,
    background: 'var(--vscode-charts-blue, #007acc)',
  },
  line: {
    position: 'absolute' as const, left: 4, top: 14, width: 2, height: 'calc(100% + 4px)',
    background: 'var(--vscode-panel-border)',
  },
  content: { flex: 1 },
  message: { fontSize: 13, fontWeight: 500, marginBottom: 2 },
  meta: { display: 'flex', gap: 12, fontSize: 11, opacity: 0.5, marginBottom: 4 },
  hash: { fontFamily: 'var(--vscode-editor-font-family)' },
  author: {},
  date: {},
  barRow: { display: 'flex', alignItems: 'center', gap: 6 },
  bar: {
    height: 4, borderRadius: 2, background: 'var(--vscode-charts-green, #27ae60)',
    maxWidth: 200, transition: 'width 0.3s ease',
  },
  fileCount: { fontSize: 10, opacity: 0.5 },
  empty: { textAlign: 'center' as const, padding: 40, opacity: 0.5 },
};
