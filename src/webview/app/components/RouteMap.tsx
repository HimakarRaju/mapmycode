import { useState, useMemo } from 'react';
import type { AppStructure, RouteInfo, HttpMethod } from '../../../appViz/appTypes';

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: '#61affe',
  POST: '#49cc90',
  PUT: '#fca130',
  DELETE: '#f93e3e',
  PATCH: '#50e3c2',
  OPTIONS: '#0d5aa7',
  HEAD: '#9012fe',
  ALL: '#888',
};

interface Props {
  structure: AppStructure;
  onRouteClick: (route: RouteInfo) => void;
}

export function RouteMap({ structure, onRouteClick }: Props) {
  const [filter, setFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState<HttpMethod | 'ALL'>('ALL');

  const filteredRoutes = useMemo(() => {
    return structure.routes.filter((r) => {
      if (methodFilter !== 'ALL' && r.method !== methodFilter) return false;
      if (filter && !r.path.toLowerCase().includes(filter.toLowerCase()) &&
          !r.handler.toLowerCase().includes(filter.toLowerCase())) return false;
      return true;
    });
  }, [structure.routes, filter, methodFilter]);

  // Group by path prefix
  const groups = useMemo(() => {
    const map = new Map<string, RouteInfo[]>();
    for (const route of filteredRoutes) {
      const group = route.group || route.path.split('/').slice(0, 2).join('/') || '/';
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(route);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredRoutes]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Routes ({structure.routes.length})</h3>
        <div style={styles.filters}>
          <input
            type="text"
            placeholder="Filter routes..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={styles.input}
          />
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value as HttpMethod | 'ALL')}
            style={styles.select}
          >
            <option value="ALL">All Methods</option>
            {(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as HttpMethod[]).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={styles.routeList}>
        {groups.map(([group, routes]) => (
          <div key={group} style={styles.group}>
            <div style={styles.groupHeader}>{group}</div>
            {routes.map((route, idx) => (
              <div
                key={`${route.method}-${route.path}-${idx}`}
                style={styles.routeRow}
                onClick={() => onRouteClick(route)}
                role="button"
                tabIndex={0}
              >
                <span style={{
                  ...styles.method,
                  backgroundColor: METHOD_COLORS[route.method] || '#888',
                }}>{route.method}</span>
                <span style={styles.path}>{route.path}</span>
                <span style={styles.handler}>{route.handler}</span>
                <span style={styles.file}>{route.file}:{route.line}</span>
                {route.middleware.length > 0 && (
                  <span style={styles.mwBadge}>{route.middleware.length} mw</span>
                )}
              </div>
            ))}
          </div>
        ))}
        {filteredRoutes.length === 0 && (
          <div style={styles.empty}>No routes found.</div>
        )}
      </div>

      {/* Models section */}
      {structure.models.length > 0 && (
        <div style={styles.modelsSection}>
          <h3 style={styles.title}>Models ({structure.models.length})</h3>
          {structure.models.map((model) => (
            <div key={model.name} style={styles.modelCard}>
              <div style={styles.modelName}>{model.name}</div>
              <div style={styles.modelFile}>{model.file}:{model.line}</div>
              {model.fields.map((f) => (
                <div key={f.name} style={styles.field}>
                  <span>{f.name}</span>
                  <span style={styles.fieldType}>{f.type}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Middleware section */}
      {structure.middleware.length > 0 && (
        <div style={styles.mwSection}>
          <h3 style={styles.title}>Middleware ({structure.middleware.length})</h3>
          {structure.middleware.map((mw, i) => (
            <div key={i} style={styles.mwRow}>
              <span style={styles.mwName}>{mw.name}</span>
              <span style={styles.mwScope}>{mw.scope}</span>
              <span style={styles.file}>{mw.file}:{mw.line}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 12, overflow: 'auto', height: '100%' },
  header: { marginBottom: 12 },
  title: { margin: '0 0 8px', fontSize: 14, fontWeight: 700 },
  filters: { display: 'flex', gap: 8 },
  input: {
    flex: 1,
    padding: '4px 8px',
    background: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    border: '1px solid var(--vscode-input-border)',
    borderRadius: 3,
    fontSize: 12,
  },
  select: {
    padding: '4px 8px',
    background: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    border: '1px solid var(--vscode-input-border)',
    borderRadius: 3,
    fontSize: 12,
  },
  routeList: { },
  group: { marginBottom: 12 },
  groupHeader: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    opacity: 0.6,
    padding: '4px 0',
    borderBottom: '1px solid var(--vscode-panel-border)',
    marginBottom: 4,
  },
  routeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 8px',
    cursor: 'pointer',
    borderRadius: 3,
    fontSize: 12,
  },
  method: {
    padding: '2px 6px',
    borderRadius: 3,
    color: '#fff',
    fontWeight: 700,
    fontSize: 10,
    minWidth: 48,
    textAlign: 'center' as const,
  },
  path: { fontFamily: 'var(--vscode-editor-font-family)', fontWeight: 500 },
  handler: { opacity: 0.6, marginLeft: 'auto' },
  file: { fontSize: 10, opacity: 0.4 },
  mwBadge: {
    fontSize: 10,
    padding: '1px 4px',
    background: 'var(--vscode-badge-background)',
    color: 'var(--vscode-badge-foreground)',
    borderRadius: 8,
  },
  empty: { textAlign: 'center' as const, padding: 24, opacity: 0.5 },
  modelsSection: { marginTop: 16, borderTop: '1px solid var(--vscode-panel-border)', paddingTop: 12 },
  modelCard: {
    padding: 8,
    border: '1px solid var(--vscode-panel-border)',
    borderRadius: 4,
    marginBottom: 8,
  },
  modelName: { fontWeight: 700, fontSize: 13 },
  modelFile: { fontSize: 10, opacity: 0.4, marginBottom: 4 },
  field: { display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 8px' },
  fieldType: { fontFamily: 'var(--vscode-editor-font-family)', opacity: 0.7 },
  mwSection: { marginTop: 16, borderTop: '1px solid var(--vscode-panel-border)', paddingTop: 12 },
  mwRow: { display: 'flex', gap: 8, fontSize: 12, padding: '4px 8px', alignItems: 'center' },
  mwName: { fontWeight: 500 },
  mwScope: { fontSize: 10, opacity: 0.5, padding: '1px 4px', background: 'var(--vscode-badge-background)', borderRadius: 3 },
};
