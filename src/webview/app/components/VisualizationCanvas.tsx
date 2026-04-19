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
import { ObjectRenderer } from '../renderers/ObjectRenderer';

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

      {/* Objects */}
      {grouped.objects.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Objects</div>
          {grouped.objects.map((v) => (
            <ObjectRenderer key={v.name} variable={v} />
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
        <VariablesPanel variables={grouped.primitives} />
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
    const normalized = {
      ...v,
      dsType: inferVisualizationType(v),
    };

    // Check for histogram annotation override
    if (histVars.includes(v.name) && (normalized.dsType === 'array' || normalized.dsType === 'array2d')) {
      result.histograms.push(normalized);
      continue;
    }

    const dsType: DataStructureType = normalized.dsType;
    switch (dsType) {
      case 'array':
      case 'array2d':
        result.arrays.push(normalized); break;
      case 'stack':
        result.stacks.push(normalized); break;
      case 'queue':
        result.queues.push(normalized); break;
      case 'linkedList':
        result.linkedLists.push(normalized); break;
      case 'binaryTree':
        result.binaryTrees.push(normalized); break;
      case 'graph':
        result.graphs.push(normalized); break;
      case 'hashMap':
        result.hashMaps.push(normalized); break;
      case 'set':
        result.sets.push(normalized); break;
      case 'primitive':
        result.primitives.push(normalized); break;
      default:
        result.objects.push(normalized); break;
    }
  }

  return result;
}

function inferVisualizationType(variable: TrackedVariable): DataStructureType {
  if (variable.dsType !== 'object' && variable.dsType !== 'unknown') {
    return normalizeNameBasedType(variable.name, variable.dsType, variable.value);
  }

  const inferredFromValue = inferTypeFromValue(variable.value);
  return normalizeNameBasedType(variable.name, inferredFromValue, variable.value);
}

function normalizeNameBasedType(name: string, type: DataStructureType, value: any): DataStructureType {
  const normalizedName = name.toLowerCase();

  if ((type === 'array' || type === 'array2d') && normalizedName.includes('stack')) {
    return 'stack';
  }

  if ((type === 'array' || type === 'array2d') && (normalizedName.includes('queue') || normalizedName.includes('deque'))) {
    return 'queue';
  }

  if ((type === 'hashMap' || type === 'object') && normalizedName.includes('graph') && looksLikeGraph(value)) {
    return 'graph';
  }

  return type;
}

function inferTypeFromValue(value: any): DataStructureType {
  if (value === null || value === undefined) {
    return 'primitive';
  }

  if (Array.isArray(value)) {
    if (value.length > 0 && Array.isArray(value[0])) {
      return 'array2d';
    }
    return 'array';
  }

  if (typeof value !== 'object') {
    return 'primitive';
  }

  if (looksLikeLinkedList(value)) {
    return 'linkedList';
  }

  if (looksLikeBinaryTree(value)) {
    return 'binaryTree';
  }

  if (looksLikeGraph(value)) {
    return 'graph';
  }

  if (Object.keys(value).length > 0) {
    return 'hashMap';
  }

  return 'object';
}

function looksLikeLinkedList(value: any): boolean {
  return Boolean(value && typeof value === 'object' && 'next' in value && ('val' in value || 'value' in value || 'data' in value));
}

function looksLikeBinaryTree(value: any): boolean {
  return Boolean(value && typeof value === 'object' && ('left' in value || 'right' in value) && ('val' in value || 'value' in value || 'data' in value));
}

function looksLikeGraph(value: any): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const entries = Object.entries(value).slice(0, 12);
  if (entries.length === 0) {
    return false;
  }

  return entries.every(([, neighbors]) => {
    if (Array.isArray(neighbors)) {
      return neighbors.every((neighbor) => ['string', 'number'].includes(typeof neighbor) || (neighbor && typeof neighbor === 'object' && ('to' in neighbor || 'node' in neighbor)));
    }

    return Boolean(neighbors && typeof neighbors === 'object' && ('neighbors' in neighbors || 'edges' in neighbors));
  });
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
