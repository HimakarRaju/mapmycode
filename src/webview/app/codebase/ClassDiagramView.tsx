import React from 'react';
import type { ClassInfo } from '../../../codebase/codebaseTypes';

interface Props {
  classes: ClassInfo[];
  onClassClick?: (file: string, line: number) => void;
}

export function ClassDiagramView({ classes, onClassClick }: Props) {
  if (classes.length === 0) {
    return <div style={styles.empty}>No classes found</div>;
  }

  // Build inheritance map
  const nameMap = new Map(classes.map((c) => [c.name, c]));

  return (
    <div style={styles.container}>
      <div style={styles.header}>Class Diagram ({classes.length} classes)</div>
      <div style={styles.grid}>
        {classes.map((cls, i) => (
          <div key={i} style={styles.card} onClick={() => onClassClick?.(cls.file, cls.line)}>
            <div style={styles.className}>
              {cls.name}
              {cls.extends && <span style={styles.extends}> ← {cls.extends}</span>}
            </div>
            <div style={styles.file}>{cls.file}:{cls.line}</div>
            {cls.implements && cls.implements.length > 0 && (
              <div style={styles.implements}>
                implements {cls.implements.join(', ')}
              </div>
            )}
            {cls.properties.length > 0 && (
              <div style={styles.section}>
                <div style={styles.sectionLabel}>Properties</div>
                {cls.properties.map((p, j) => (
                  <div key={j} style={styles.member}>📦 {p}</div>
                ))}
              </div>
            )}
            {cls.methods.length > 0 && (
              <div style={styles.section}>
                <div style={styles.sectionLabel}>Methods</div>
                {cls.methods.map((m, j) => (
                  <div key={j} style={styles.member}>⚡ {m}()</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Inheritance lines (SVG overlay) */}
      <svg style={styles.lines} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 12, overflow: 'auto', height: '100%' },
  header: { fontSize: 14, fontWeight: 700, marginBottom: 12 },
  grid: { display: 'flex', flexWrap: 'wrap', gap: 12 },
  card: {
    width: 220, padding: 10, borderRadius: 6,
    border: '1px solid var(--vscode-panel-border)',
    background: 'var(--vscode-editor-background)',
    cursor: 'pointer', fontSize: 12,
    fontFamily: 'var(--vscode-editor-font-family)',
  },
  className: { fontSize: 14, fontWeight: 700, marginBottom: 2 },
  extends: { fontWeight: 400, opacity: 0.6 },
  file: { fontSize: 10, opacity: 0.5, marginBottom: 8 },
  implements: { fontSize: 10, opacity: 0.6, marginBottom: 6, fontStyle: 'italic' },
  section: { marginTop: 6, borderTop: '1px solid var(--vscode-panel-border)', paddingTop: 4 },
  sectionLabel: { fontSize: 9, textTransform: 'uppercase' as const, opacity: 0.4, marginBottom: 2 },
  member: { fontSize: 11, padding: '1px 0' },
  lines: { position: 'absolute' as const, top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' },
  empty: { textAlign: 'center' as const, padding: 40, opacity: 0.5 },
};
