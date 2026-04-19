import { useState, useEffect, useRef } from 'react';
import type { RequestTrace } from '../../../appViz/appTypes';

const STATUS_COLORS: Record<string, string> = {
  '2': '#49cc90',
  '3': '#fca130',
  '4': '#f93e3e',
  '5': '#f93e3e',
};

function statusColor(code: number): string {
  return STATUS_COLORS[String(code)[0]] || '#888';
}

interface Props {
  requests: RequestTrace[];
  onRequestClick: (request: RequestTrace) => void;
}

export function RequestMonitor({ requests, onRequestClick }: Props) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [requests.length, autoScroll]);

  const selected = selectedId ? requests.find((r) => r.id === selectedId) : null;

  // Stats
  const totalReqs = requests.length;
  const avgDuration = totalReqs > 0
    ? Math.round(requests.reduce((s, r) => s + r.duration, 0) / totalReqs)
    : 0;
  const errorCount = requests.filter((r) => r.statusCode >= 400).length;

  return (
    <div style={styles.container}>
      {/* Stats bar */}
      <div style={styles.statsBar}>
        <div style={styles.stat}>
          <span style={styles.statValue}>{totalReqs}</span>
          <span style={styles.statLabel}>Requests</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statValue}>{avgDuration}ms</span>
          <span style={styles.statLabel}>Avg Duration</span>
        </div>
        <div style={styles.stat}>
          <span style={{ ...styles.statValue, color: errorCount > 0 ? '#f93e3e' : undefined }}>
            {errorCount}
          </span>
          <span style={styles.statLabel}>Errors</span>
        </div>
        <label style={styles.autoScrollLabel}>
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
          />
          Auto-scroll
        </label>
      </div>

      <div style={styles.main}>
        {/* Request list */}
        <div ref={listRef} style={styles.list}>
          {requests.length === 0 && (
            <div style={styles.empty}>
              Waiting for requests... Start your app and make some requests.
            </div>
          )}
          {requests.map((req) => (
            <div
              key={req.id}
              style={{
                ...styles.row,
                ...(selectedId === req.id ? styles.rowSelected : {}),
              }}
              onClick={() => {
                setSelectedId(req.id);
                onRequestClick(req);
              }}
              role="button"
              tabIndex={0}
            >
              <span style={{
                ...styles.status,
                backgroundColor: statusColor(req.statusCode),
              }}>{req.statusCode}</span>
              <span style={styles.methodBadge}>{req.method}</span>
              <span style={styles.reqPath}>{req.path}</span>
              <span style={styles.duration}>{req.duration.toFixed(0)}ms</span>
              <span style={styles.time}>
                {new Date(req.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={styles.detail}>
            <h4 style={styles.detailTitle}>
              {selected.method} {selected.path}
            </h4>
            <div style={styles.detailRow}>
              <span>Status</span>
              <span style={{ color: statusColor(selected.statusCode) }}>
                {selected.statusCode}
              </span>
            </div>
            <div style={styles.detailRow}>
              <span>Duration</span>
              <span>{selected.duration.toFixed(2)}ms</span>
            </div>
            <div style={styles.detailRow}>
              <span>Handler</span>
              <span>{selected.handler}</span>
            </div>
            {selected.error && (
              <div style={styles.detailRow}>
                <span>Error</span>
                <span style={{ color: '#f93e3e' }}>{selected.error}</span>
              </div>
            )}
            {selected.middlewareChain.length > 0 && (
              <div style={styles.mwChain}>
                <div style={styles.mwChainTitle}>Middleware Chain</div>
                {selected.middlewareChain.map((mw, i) => (
                  <div key={i} style={styles.mwStep}>
                    <span style={styles.mwOrder}>{mw.order}</span>
                    <span>{mw.name}</span>
                    <span style={styles.mwDuration}>{mw.duration.toFixed(1)}ms</span>
                  </div>
                ))}
              </div>
            )}
            {selected.requestHeaders && (
              <div style={styles.headers}>
                <div style={styles.mwChainTitle}>Request Headers</div>
                {Object.entries(selected.requestHeaders).slice(0, 15).map(([k, v]) => (
                  <div key={k} style={styles.headerRow}>
                    <span style={styles.headerKey}>{k}</span>
                    <span style={styles.headerVal}>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  statsBar: {
    display: 'flex',
    gap: 16,
    padding: '8px 12px',
    borderBottom: '1px solid var(--vscode-panel-border)',
    alignItems: 'center',
    flexShrink: 0,
  },
  stat: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center' },
  statValue: { fontWeight: 700, fontSize: 16 },
  statLabel: { fontSize: 10, opacity: 0.6 },
  autoScrollLabel: { fontSize: 11, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' },
  main: { display: 'flex', flex: 1, overflow: 'hidden' },
  list: { flex: 1, overflow: 'auto', minWidth: 0 },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 12px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--vscode-panel-border)',
    fontSize: 12,
  },
  rowSelected: {
    background: 'var(--vscode-list-activeSelectionBackground)',
    color: 'var(--vscode-list-activeSelectionForeground)',
  },
  status: {
    padding: '2px 6px',
    borderRadius: 3,
    color: '#fff',
    fontWeight: 700,
    fontSize: 10,
    minWidth: 30,
    textAlign: 'center' as const,
  },
  methodBadge: { fontWeight: 600, fontSize: 10, minWidth: 36 },
  reqPath: { fontFamily: 'var(--vscode-editor-font-family)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  duration: { fontSize: 11, opacity: 0.7 },
  time: { fontSize: 10, opacity: 0.4 },
  empty: { textAlign: 'center' as const, padding: 32, opacity: 0.5 },
  detail: {
    width: 280,
    borderLeft: '1px solid var(--vscode-panel-border)',
    padding: 12,
    overflow: 'auto',
    flexShrink: 0,
  },
  detailTitle: { margin: '0 0 12px', fontSize: 13, wordBreak: 'break-all' as const },
  detailRow: { display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px solid var(--vscode-panel-border)' },
  mwChain: { marginTop: 12 },
  mwChainTitle: { fontSize: 11, fontWeight: 600, marginBottom: 4, opacity: 0.7 },
  mwStep: { display: 'flex', gap: 8, fontSize: 11, padding: '2px 0' },
  mwOrder: { width: 18, textAlign: 'center' as const, opacity: 0.5 },
  mwDuration: { marginLeft: 'auto', opacity: 0.6 },
  headers: { marginTop: 12 },
  headerRow: { display: 'flex', gap: 8, fontSize: 11, padding: '1px 0', overflow: 'hidden' },
  headerKey: { fontWeight: 600, flexShrink: 0, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' },
  headerVal: { opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
};
