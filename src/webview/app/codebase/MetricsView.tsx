import React from 'react';
import type { CodeMetrics } from '../../../codebase/codebaseTypes';

interface Props {
  metrics: CodeMetrics;
  onFileClick?: (file: string) => void;
}

export function MetricsView({ metrics, onFileClick }: Props) {
  const langs = Object.entries(metrics.languages).sort((a, b) => b[1].lines - a[1].lines);
  const maxLines = langs.length > 0 ? langs[0][1].lines : 1;

  return (
    <div style={styles.container}>
      <div style={styles.header}>Code Metrics</div>
      <div style={styles.summaryRow}>
        <div style={styles.bigStat}>
          <div style={styles.bigNum}>{metrics.files}</div>
          <div style={styles.bigLabel}>Files</div>
        </div>
        <div style={styles.bigStat}>
          <div style={styles.bigNum}>{formatNumber(metrics.totalLines)}</div>
          <div style={styles.bigLabel}>Lines</div>
        </div>
        <div style={styles.bigStat}>
          <div style={styles.bigNum}>{langs.length}</div>
          <div style={styles.bigLabel}>Languages</div>
        </div>
      </div>

      <div style={styles.sectionTitle}>Language Distribution</div>
      {langs.map(([lang, data]) => (
        <div key={lang} style={styles.langRow}>
          <span style={styles.langName}>{lang}</span>
          <div style={styles.barContainer}>
            <div style={{ ...styles.bar, width: `${(data.lines / maxLines) * 100}%` }} />
          </div>
          <span style={styles.langStats}>{data.files}f / {formatNumber(data.lines)}L</span>
        </div>
      ))}

      <div style={styles.sectionTitle}>Largest Files</div>
      {metrics.largest.map((f, i) => (
        <div key={i} style={styles.fileRow} onClick={() => onFileClick?.(f.file)}>
          <span style={styles.rank}>#{i + 1}</span>
          <span style={styles.fileName}>{f.file}</span>
          <span style={styles.fileLines}>{formatNumber(f.lines)} lines</span>
        </div>
      ))}
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 16, overflow: 'auto', height: '100%' },
  header: { fontSize: 16, fontWeight: 700, marginBottom: 16 },
  summaryRow: { display: 'flex', gap: 32, marginBottom: 24 },
  bigStat: { textAlign: 'center' as const },
  bigNum: { fontSize: 28, fontWeight: 700, color: 'var(--vscode-charts-blue, #007acc)' },
  bigLabel: { fontSize: 11, opacity: 0.6, textTransform: 'uppercase' as const },
  sectionTitle: {
    fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const,
    opacity: 0.5, marginBottom: 8, marginTop: 16,
  },
  langRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  langName: { width: 90, fontSize: 12, fontWeight: 500 },
  barContainer: {
    flex: 1, height: 10, background: 'var(--vscode-panel-border)', borderRadius: 5,
  },
  bar: {
    height: '100%', borderRadius: 5,
    background: 'var(--vscode-charts-blue, #007acc)',
    transition: 'width 0.3s ease',
  },
  langStats: { width: 80, textAlign: 'right' as const, fontSize: 11, opacity: 0.6 },
  fileRow: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '3px 4px',
    cursor: 'pointer', borderRadius: 3, fontSize: 12,
  },
  rank: { width: 24, fontWeight: 700, opacity: 0.5 },
  fileName: { flex: 1, fontFamily: 'var(--vscode-editor-font-family)' },
  fileLines: { opacity: 0.5, fontSize: 11 },
};
