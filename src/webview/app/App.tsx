import { useState, useEffect, useCallback } from 'react';
import { PlaybackControls } from './components/PlaybackControls';
import { CodePane } from './components/CodePane';
import { VisualizationCanvas } from './components/VisualizationCanvas';
import { ComplexityPanel } from './components/ComplexityPanel';
import { RouteMap } from './components/RouteMap';
import { RequestMonitor } from './components/RequestMonitor';
import { FileTreeView } from './codebase/FileTreeView';
import { DependencyGraphView } from './codebase/DependencyGraphView';
import { CallGraphView } from './codebase/CallGraphView';
import { ClassDiagramView } from './codebase/ClassDiagramView';
import { MetricsView } from './codebase/MetricsView';
import { GitHistoryView } from './codebase/GitHistoryView';
import { vscode } from './index';
import type { ExecutionTrace } from '../../instrumenter/traceSchema';
import type { AppStructure, RequestTrace, RouteInfo } from '../../appViz/appTypes';
import type { ComplexityResult } from '../../features/complexityAnalyzer';

type ViewMode = 'algorithm' | 'app' | 'codebase';
type AppTab = 'routes' | 'requests';

interface AppState {
  // Shared
  viewMode: ViewMode;
  error: string | null;
  // Algorithm viz
  trace: ExecutionTrace | null;
  currentStep: number;
  isPlaying: boolean;
  speed: number;
  zoom: number;
  code: string;
  language: string;
  complexity: ComplexityResult | null;
  // App viz
  appStructure: AppStructure | null;
  appRequests: RequestTrace[];
  appTab: AppTab;
  appRunning: boolean;
  // Codebase viz
  codebaseView: string | null;
  codebaseData: any;
}

export function App() {
  const [state, setState] = useState<AppState>(() => {
    const s = vscode.getState();
    if (s) {
      return { ...s, isPlaying: false }; // Never resume playback automatically
    }
    return {
      viewMode: 'algorithm',
      error: null,
      trace: null,
      currentStep: 0,
      isPlaying: false,
      speed: 1,
      zoom: 1,
      code: '',
      language: 'javascript',
      complexity: null,
      appStructure: null,
      appRequests: [],
      appTab: 'routes',
      appRunning: false,
      codebaseView: null,
      codebaseData: null,
    };
  });

  useEffect(() => {
    vscode.setState(state);
  }, [state]);

  // Listen for messages from extension host
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      switch (msg.type) {
        case 'trace':
          {
            const hasUserFunctionCalls = msg.data.steps.some((step: ExecutionTrace['steps'][number]) =>
              step.event === 'call' && step.functionName && step.functionName !== '<module>'
            );
            const firstVisibleStepIndex = msg.data.steps.findIndex((step: ExecutionTrace['steps'][number]) =>
              typeof step.line === 'number' && step.line > 0,
            );
          setState((s) => ({
            ...s,
            viewMode: 'algorithm',
            trace: msg.data,
            code: msg.data.code,
            language: msg.data.language,
            currentStep: hasUserFunctionCalls ? 0 : Math.max(firstVisibleStepIndex, 0),
            isPlaying: false,
            error: msg.data.error ?? null,
            complexity: null,
          }));
          }
          break;
        case 'error':
          setState((s) => ({ ...s, error: msg.data, isPlaying: false }));
          break;
        case 'template':
          setState((s) => ({
            ...s,
            viewMode: 'algorithm',
            code: msg.data.code,
            language: msg.data.language,
            trace: null,
            currentStep: 0,
            error: null,
          }));
          break;
        case 'appStructure':
          setState((s) => ({
            ...s,
            viewMode: 'app',
            appStructure: msg.data,
            appTab: 'routes',
            error: null,
          }));
          break;
        case 'requestTrace':
          setState((s) => ({
            ...s,
            appRequests: [...s.appRequests, msg.data],
          }));
          break;
        case 'appStatus':
          setState((s) => ({
            ...s,
            appRunning: msg.data.running,
          }));
          break;
        case 'complexity':
          setState((s) => ({ ...s, complexity: msg.data }));
          break;
        case 'codebaseView':
          setState((s) => ({
            ...s,
            viewMode: 'codebase',
            codebaseView: msg.data.view,
            codebaseData: msg.data.payload,
            error: null,
          }));
          break;
        case 'themeChanged':
          // Force re-render by toggling a dummy state
          setState((s) => ({ ...s }));
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Playback timer
  useEffect(() => {
    if (!state.isPlaying || !state.trace) return;
    const interval = setInterval(() => {
      setState((s) => {
        if (!s.trace || s.currentStep >= s.trace.totalSteps - 1) {
          return { ...s, isPlaying: false };
        }
        return { ...s, currentStep: s.currentStep + 1 };
      });
    }, 800 / state.speed);
    return () => clearInterval(interval);
  }, [state.isPlaying, state.speed, state.trace]);

  const totalSteps = state.trace?.totalSteps ?? 0;
  const currentTraceStep = state.trace?.steps[state.currentStep] ?? null;
  const hasUserFunctionCalls = state.trace?.steps.some((step) =>
    step.event === 'call' && step.functionName && step.functionName !== '<module>'
  ) ?? false;

  const onPlay = useCallback(() => setState((s) => ({ ...s, isPlaying: true })), []);
  const onPause = useCallback(() => setState((s) => ({ ...s, isPlaying: false })), []);
  const onStepForward = useCallback(() => {
    setState((s) => {
      if (!s.trace || s.currentStep >= s.trace.totalSteps - 1) return s;
      return { ...s, currentStep: s.currentStep + 1 };
    });
  }, []);
  const onStepBackward = useCallback(() => {
    setState((s) => {
      if (s.currentStep <= 0) return s;
      return { ...s, currentStep: s.currentStep - 1 };
    });
  }, []);
  const onReset = useCallback(() => {
    setState((s) => ({ ...s, currentStep: 0, isPlaying: false }));
  }, []);
  const onSpeedChange = useCallback((speed: number) => {
    setState((s) => ({ ...s, speed }));
  }, []);
  const onZoomChange = useCallback((zoom: number) => {
    setState((s) => ({ ...s, zoom }));
  }, []);
  const onStepChange = useCallback((step: number) => {
    setState((s) => ({ ...s, currentStep: step, isPlaying: false }));
  }, []);
  const onExportStep = useCallback((step: number) => {
    vscode.postMessage({ type: 'exportMarkdownStep', step });
  }, []);
  const onExportHTML = useCallback(() => {
    vscode.postMessage({ type: 'exportHTML' });
  }, []);
  const onExportJSON = useCallback(() => {
    vscode.postMessage({ type: 'exportJSON' });
  }, []);

  const onRouteClick = useCallback((route: RouteInfo) => {
    vscode.postMessage({ type: 'openFile', path: route.file, line: route.line });
  }, []);

  const onRequestClick = useCallback((_request: RequestTrace) => {
    // Could open detail panel or highlight handler
  }, []);

  const onLineClick = useCallback((line: number) => {
    // Jump to first step on that line
    setState((s) => {
      if (!s.trace) return s;
      const idx = s.trace.steps.findIndex((step) => step.line === line);
      if (idx >= 0) {
        return { ...s, currentStep: idx, isPlaying: false };
      }
      return s;
    });
    // Also tell extension to reveal line in editor
    vscode.postMessage({ type: 'goToLine', line });
  }, []);

  const onToggleApp = useCallback(() => {
    if (state.appRunning) {
      vscode.postMessage({ type: 'stopApp' });
    } else {
      vscode.postMessage({ type: 'startApp' });
    }
  }, [state.appRunning]);

  const onCodebaseFileClick = useCallback((filePath: string) => {
    vscode.postMessage({ type: 'openFile', path: filePath });
  }, []);

  const onCodebaseSymbolClick = useCallback((filePath: string, line: number) => {
    vscode.postMessage({ type: 'openFile', path: filePath, line });
  }, []);

  const activeCodebaseTitle = state.codebaseView === 'dependencies'
    ? 'Dependency Network'
    : state.codebaseView === 'callGraph'
      ? 'Call Graph'
      : state.codebaseView === 'fileTree'
        ? 'File Structure'
        : state.codebaseView === 'classDiagram'
          ? 'Class Diagram'
          : state.codebaseView === 'metrics'
            ? 'Code Metrics'
            : state.codebaseView === 'gitHistory'
              ? 'Git History'
              : 'Codebase';

  // Codebase visualization mode
  if (state.viewMode === 'codebase' && state.codebaseView) {
    return (
      <div style={styles.container}>
        <div style={styles.topBar}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
            <span style={styles.title}>MapMyCode — {activeCodebaseTitle}</span>
            <span style={{ fontSize: 11, opacity: 0.7 }}>Static workspace visualization</span>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {state.codebaseView === 'fileTree' && (
            <FileTreeView root={state.codebaseData} onFileClick={onCodebaseFileClick} />
          )}
          {state.codebaseView === 'dependencies' && (
            <DependencyGraphView graph={state.codebaseData} onNodeClick={onCodebaseFileClick} />
          )}
          {state.codebaseView === 'callGraph' && (
            <CallGraphView graph={state.codebaseData} onNodeClick={onCodebaseSymbolClick} />
          )}
          {state.codebaseView === 'classDiagram' && (
            <ClassDiagramView classes={state.codebaseData} onClassClick={onCodebaseSymbolClick} />
          )}
          {state.codebaseView === 'metrics' && (
            <MetricsView metrics={state.codebaseData} onFileClick={onCodebaseFileClick} />
          )}
          {state.codebaseView === 'gitHistory' && (
            <GitHistoryView commits={state.codebaseData} />
          )}
        </div>
        {state.error && (
          <div style={{ ...styles.errorBox, padding: '8px 16px', flexDirection: 'row' as const, gap: 8 }}>
            <span style={styles.errorIcon}>⚠</span>
            <span style={{ fontSize: 12 }}>{state.error}</span>
          </div>
        )}
      </div>
    );
  }

  // App visualization mode
  if (state.viewMode === 'app' && state.appStructure) {
    return (
      <div style={styles.container}>
        <div style={styles.topBar}>
          <span style={styles.title}>MapMyCode — {state.appStructure.framework}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setState((s) => ({ ...s, appTab: 'routes' }))}
              style={{
                ...styles.tabBtn,
                ...(state.appTab === 'routes' ? styles.tabBtnActive : {}),
              }}
            >Routes</button>
            <button
              onClick={() => setState((s) => ({ ...s, appTab: 'requests' }))}
              style={{
                ...styles.tabBtn,
                ...(state.appTab === 'requests' ? styles.tabBtnActive : {}),
              }}
            >Live Requests ({state.appRequests.length})</button>
            <button onClick={onToggleApp} style={{
              ...styles.appBtn,
              backgroundColor: state.appRunning ? '#f93e3e' : '#49cc90',
            }}>
              {state.appRunning ? 'Stop App' : 'Start App'}
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {state.appTab === 'routes' ? (
            <RouteMap structure={state.appStructure} onRouteClick={onRouteClick} />
          ) : (
            <RequestMonitor requests={state.appRequests} onRequestClick={onRequestClick} />
          )}
        </div>
        {state.error && (
          <div style={{ ...styles.errorBox, padding: '8px 16px', flexDirection: 'row' as const, gap: 8 }}>
            <span style={styles.errorIcon}>⚠</span>
            <span style={{ fontSize: 12 }}>{state.error}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <span style={styles.title}>MapMyCode</span>
        {state.trace && (
          <span style={styles.stepInfo}>
            Step {state.currentStep + 1} / {totalSteps}
          </span>
        )}
      </div>

      {/* Main content */}
      <div style={styles.main}>
        {/* Code pane */}
        <div style={styles.codeSection}>
          <CodePane
            code={
              (currentTraceStep?.file && state.trace?.files?.[currentTraceStep.file])
                ? state.trace.files[currentTraceStep.file]
                : (state.trace?.code ?? state.code)
            }
            activeLine={currentTraceStep?.line ?? null}
            language={state.language}
            onLineClick={onLineClick}
            filename={currentTraceStep?.file}
          />
        </div>

        {/* Visualization pane */}
        <div style={styles.vizSection}>
          {state.error ? (
            <div style={styles.errorBox}>
              <span style={styles.errorIcon}>⚠</span>
              <pre style={styles.errorText}>{state.error}</pre>
            </div>
          ) : state.trace ? (
            <div style={styles.traceContent}>
              {!hasUserFunctionCalls && (
                <div style={styles.infoBanner}>
                  Only imports and top-level definitions ran. Function bodies were not executed, so the trace cannot go deeper until the file actually calls something.
                </div>
              )}
              <VisualizationCanvas
                trace={state.trace}
                currentStep={state.currentStep}
                zoom={state.zoom}
              />
            </div>
          ) : (
            <div style={styles.placeholder}>
              <div style={styles.placeholderIcon}>▶</div>
              <p>Open a JS or Python file and run <strong>MapMyCode: Visualize Current File</strong></p>
              <p style={styles.hint}>Or use Ctrl+Shift+P → "MapMyCode: Open Algorithm Templates"</p>
            </div>
          )}
        </div>
      </div>

      {/* Complexity Analysis */}
      {state.complexity && <ComplexityPanel result={state.complexity} />}

      {/* Playback controls */}
      <PlaybackControls
        isPlaying={state.isPlaying}
        currentStep={state.currentStep}
        totalSteps={totalSteps}
        speed={state.speed}
        zoom={state.zoom}
        onPlay={onPlay}
        onPause={onPause}
        onStepForward={onStepForward}
        onStepBackward={onStepBackward}
        onReset={onReset}
        onSpeedChange={onSpeedChange}
        onZoomChange={onZoomChange}
        onStepChange={onStepChange}
        onExportStep={onExportStep}
        onExportHTML={onExportHTML}
        onExportJSON={onExportJSON}
        disabled={!state.trace}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    borderBottom: '1px solid var(--vscode-panel-border)',
    flexShrink: 0,
  },
  title: {
    fontWeight: 700,
    fontSize: '14px',
  },
  stepInfo: {
    fontSize: '12px',
    opacity: 0.8,
  },
  main: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  codeSection: {
    width: '35%',
    minWidth: 200,
    borderRight: '1px solid var(--vscode-panel-border)',
    overflow: 'auto',
  },
  vizSection: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  traceContent: {
    width: '100%',
    height: '100%',
    overflow: 'auto',
  },
  infoBanner: {
    margin: '12px 16px 0',
    padding: '10px 12px',
    borderRadius: 6,
    background: 'var(--vscode-textBlockQuote-background)',
    borderLeft: '3px solid var(--vscode-textLink-foreground)',
    fontSize: 12,
    opacity: 0.9,
  },
  placeholder: {
    textAlign: 'center' as const,
    opacity: 0.6,
    padding: 40,
  },
  placeholderIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.3,
  },
  hint: {
    fontSize: '12px',
    opacity: 0.7,
    marginTop: 8,
  },
  errorBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: 24,
    color: 'var(--vscode-errorForeground)',
  },
  errorIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  errorText: {
    whiteSpace: 'pre-wrap' as const,
    fontFamily: 'var(--vscode-editor-font-family)',
    fontSize: '13px',
    maxWidth: '100%',
    overflow: 'auto',
  },
  tabBtn: {
    padding: '4px 12px',
    border: '1px solid var(--vscode-panel-border)',
    background: 'transparent',
    color: 'var(--vscode-editor-foreground)',
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: 12,
  },
  tabBtnActive: {
    background: 'var(--vscode-button-background)',
    color: 'var(--vscode-button-foreground)',
    borderColor: 'var(--vscode-button-background)',
  },
  appBtn: {
    padding: '4px 12px',
    border: 'none',
    color: '#fff',
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  },
};
