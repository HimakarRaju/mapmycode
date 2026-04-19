import React, { useMemo } from 'react';
import type { ExecutionTrace, TraceStep } from '../../../instrumenter/traceSchema';

interface Props {
  trace: ExecutionTrace;
  currentStep: number;
}

interface CallNode {
  name: string;
  args?: any[];
  returnValue?: any;
  startStep: number;
  endStep?: number;
  children: CallNode[];
}

export function FunctionCallTree({ trace, currentStep }: Props) {
  const tree = useMemo(() => buildCallTree(trace.steps), [trace.steps]);
  if (tree.length === 0) return null;

  return (
    <div style={styles.wrapper}>
      <div style={styles.title}>Function Call Tree</div>
      <div style={styles.tree}>
        {tree.map((node, i) => (
          <CallNodeView key={i} node={node} currentStep={currentStep} depth={0} />
        ))}
      </div>
    </div>
  );
}

function CallNodeView({ node, currentStep, depth }: { node: CallNode; currentStep: number; depth: number }) {
  const isActive = currentStep >= node.startStep && (node.endStep === undefined || currentStep <= node.endStep);
  const isPast = node.endStep !== undefined && currentStep > node.endStep;

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div style={{
        ...styles.node,
        ...(isActive ? styles.activeNode : {}),
        ...(isPast ? styles.pastNode : {}),
      }}>
        <span style={styles.fnName}>{node.name}</span>
        {node.args && node.args.length > 0 && (
          <span style={styles.args}>({node.args.map((a) => JSON.stringify(a)).join(', ')})</span>
        )}
        {node.returnValue !== undefined && (
          <span style={styles.retVal}> → {JSON.stringify(node.returnValue)}</span>
        )}
      </div>
      {node.children.map((child, i) => (
        <CallNodeView key={i} node={child} currentStep={currentStep} depth={depth + 1} />
      ))}
    </div>
  );
}

function buildCallTree(steps: TraceStep[]): CallNode[] {
  const roots: CallNode[] = [];
  const stack: CallNode[] = [];

  for (const step of steps) {
    if (step.event === 'call' && step.functionName) {
      const node: CallNode = {
        name: step.functionName,
        args: step.args,
        startStep: step.step,
        children: [],
      };
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(node);
      } else {
        roots.push(node);
      }
      stack.push(node);
    } else if (step.event === 'return' && stack.length > 0) {
      const current = stack.pop()!;
      current.endStep = step.step;
      current.returnValue = step.returnValue;
    }
  }

  return roots;
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { marginBottom: 16 },
  title: {
    fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const,
    opacity: 0.6, marginBottom: 8, letterSpacing: '0.5px',
  },
  tree: {},
  node: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '2px 8px', borderRadius: 3, marginBottom: 2,
    fontSize: 12, fontFamily: 'var(--vscode-editor-font-family)',
    border: '1px solid var(--vscode-panel-border)',
  },
  activeNode: {
    background: 'var(--vscode-editor-selectionBackground)',
    borderColor: 'var(--vscode-charts-blue, #007acc)',
  },
  pastNode: { opacity: 0.5 },
  fnName: { fontWeight: 700 },
  args: { opacity: 0.7 },
  retVal: { color: 'var(--vscode-charts-green, #4ec9b0)' },
};
