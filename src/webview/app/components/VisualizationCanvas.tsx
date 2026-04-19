import React, { useMemo } from 'react';
import type { ExecutionTrace, TraceStep, TrackedVariable, DataStructureType, AnnotationConfig } from '../../../instrumenter/traceSchema';
import { ArrayRenderer } from '../renderers/ArrayRenderer';
import { VariablesPanel } from '../renderers/VariablesPanel';
import { LinkedListRenderer } from '../renderers/LinkedListRenderer';
import { BinaryTreeRenderer } from '../renderers/BinaryTreeRenderer';
import { GraphRenderer } from '../renderers/GraphRenderer';
import { StackRenderer } from '../renderers/StackRenderer';
import { QueueRenderer } from '../renderers/QueueRenderer';
import { HashMapRenderer } from '../renderers/HashMapRenderer';
import { SetRenderer } from '../renderers/SetRenderer';
import { HistogramRenderer } from '../renderers/HistogramRenderer';
import { FunctionCallTree } from '../renderers/FunctionCallTree';

interface VisualizationCanvasProps {
  trace: ExecutionTrace;
  currentStep: number;
  zoom: number;
}

export function VisualizationCanvas({ trace, currentStep, zoom }: VisualizationCanvasProps) {
  const step = trace.steps[currentStep];
  if (!step) {
    return <div style={styles.empty}>No trace data</div>;
  }

  const grouped = useMemo(() => groupVariables(step, trace.annotations), [step, trace.annotations]);
  const hasCalls = trace.steps.some((s) => s.event === 'call');

  return (
    <div style={{ ...styles.container, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
      {/* Arrays & Histograms */}
      {grouped.arrays.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Arrays</div>
          {grouped.arrays.map((v) => (
            <ArrayRenderer key={v.name} variable={v} />
          ))}
        </div>
      )}
      {grouped.histograms.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Histograms</div>
          {grouped.histograms.map((v) => (
            <HistogramRenderer key={v.name} variable={v} />
          ))}
        </div>
      )}

      {/* Stacks */}
      {grouped.stacks.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Stacks</div>
          {grouped.stacks.map((v) => (
            <StackRenderer key={v.name} variable={v} />
          ))}
        </div>
      )}

      {/* Queues */}
      {grouped.queues.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Queues</div>
          {grouped.queues.map((v) => (
            <QueueRenderer key={v.name} variable={v} />
          ))}
        </div>
      )}

      {/* Linked Lists */}
      {grouped.linkedLists.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Linked Lists</div>
          {grouped.linkedLists.map((v) => (
            <LinkedListRenderer key={v.name} variable={v} />
          ))}
        </div>
      )}

      {/* Binary Trees */}
      {grouped.binaryTrees.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Binary Trees</div>
          {grouped.binaryTrees.map((v) => (
            <BinaryTreeRenderer key={v.name} variable={v} />
          ))}
        </div>
      )}

      {/* Graphs */}
      {grouped.graphs.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Graphs</div>
          {grouped.graphs.map((v) => (
            <GraphRenderer key={v.name} variable={v} />
          ))}
        </div>
      )}

      {/* Hash Maps */}
      {grouped.hashMaps.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Hash Maps</div>
          {grouped.hashMaps.map((v) => (
            <HashMapRenderer key={v.name} variable={v} />
          ))}
        </div>
      )}

      {/* Sets */}
      {grouped.sets.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Sets</div>
          {grouped.sets.map((v) => (
            <SetRenderer key={v.name} variable={v} />
          ))}
        </div>
      )}

      {/* Function Call Tree */}
      {hasCalls && (
        <FunctionCallTree trace={trace} currentStep={currentStep} />
      )}

      {/* Variables table for primitives */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Variables</div>
        <VariablesPanel variables={step.variables} />
      </div>

      {/* Function info */}
      {step.event === 'call' && step.functionName && (
        <div style={styles.callInfo}>
          <span style={styles.callBadge}>CALL</span>
          <code>{step.functionName}({step.args?.map((a) => JSON.stringify(a)).join(', ')})</code>
        </div>
      )}
      {step.event === 'return' && step.functionName && (
        <div style={styles.callInfo}>
          <span style={{ ...styles.callBadge, background: 'var(--vscode-charts-green, #4ec9b0)' }}>RETURN</span>
          <code>{step.functionName} → {JSON.stringify(step.returnValue)}</code>
        </div>
      )}
    </div>
  );
}

interface GroupedVariables {
  arrays: TrackedVariable[];
  histograms: TrackedVariable[];
  stacks: TrackedVariable[];
  queues: TrackedVariable[];
  linkedLists: TrackedVariable[];
  binaryTrees: TrackedVariable[];
  graphs: TrackedVariable[];
  hashMaps: TrackedVariable[];
  sets: TrackedVariable[];
  primitives: TrackedVariable[];
  objects: TrackedVariable[];
}

function groupVariables(step: TraceStep, annotations?: AnnotationConfig): GroupedVariables {
  const result: GroupedVariables = {
    arrays: [], histograms: [], stacks: [], queues: [],
    linkedLists: [], binaryTrees: [], graphs: [],
    hashMaps: [], sets: [], primitives: [], objects: [],
  };
  const histVars = annotations?.hist || [];

  for (const v of step.variables) {
    // Check for histogram annotation override
    if (histVars.includes(v.name) && (v.dsType === 'array' || v.dsType === 'array2d')) {
      result.histograms.push(v);
      continue;
    }

    const dsType: DataStructureType = v.dsType;
    switch (dsType) {
      case 'array':
      case 'array2d':
        result.arrays.push(v); break;
      case 'stack':
        result.stacks.push(v); break;
      case 'queue':
        result.queues.push(v); break;
      case 'linkedList':
        result.linkedLists.push(v); break;
      case 'binaryTree':
        result.binaryTrees.push(v); break;
      case 'graph':
        result.graphs.push(v); break;
      case 'hashMap':
        result.hashMaps.push(v); break;
      case 'set':
        result.sets.push(v); break;
      case 'primitive':
        result.primitives.push(v); break;
      default:
        result.objects.push(v); break;
    }
  }

  return result;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 16,
    width: '100%',
    minHeight: '100%',
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    opacity: 0.5,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    opacity: 0.6,
    marginBottom: 8,
    letterSpacing: '0.5px',
  },
  callInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: '8px 12px',
    borderRadius: 4,
    background: 'var(--vscode-textBlockQuote-background)',
    fontFamily: 'var(--vscode-editor-font-family)',
    fontSize: 13,
  },
  callBadge: {
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 3,
    background: 'var(--vscode-charts-blue, #007acc)',
    color: '#fff',
    fontWeight: 700,
  },
};
