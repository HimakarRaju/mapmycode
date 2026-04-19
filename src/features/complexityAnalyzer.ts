import type { ExecutionTrace } from '../instrumenter/traceSchema';

export interface ComplexityResult {
  time: string;
  space: string;
  explanation: string;
  loopDepth: number;
  recursionDetected: boolean;
}

/**
 * Estimates algorithmic complexity from execution trace data.
 * Uses heuristics: loop nesting depth, step count vs input size, recursion detection.
 */
export function analyzeComplexity(trace: ExecutionTrace): ComplexityResult {
  const steps = trace.steps;
  if (steps.length === 0) {
    return { time: 'O(1)', space: 'O(1)', explanation: 'Empty trace', loopDepth: 0, recursionDetected: false };
  }

  // Detect recursion
  const callStack: string[] = [];
  let recursionDetected = false;
  let maxCallDepth = 0;
  let currentDepth = 0;

  for (const step of steps) {
    if (step.event === 'call' && step.functionName) {
      callStack.push(step.functionName);
      currentDepth++;
      maxCallDepth = Math.max(maxCallDepth, currentDepth);
      // Check if function is already in call stack (recursion)
      const countInStack = callStack.filter((f) => f === step.functionName).length;
      if (countInStack > 1) {
        recursionDetected = true;
      }
    } else if (step.event === 'return') {
      callStack.pop();
      currentDepth--;
    }
  }

  // Detect loop depth by counting repeated line visits
  const lineVisits = new Map<number, number>();
  for (const step of steps) {
    lineVisits.set(step.line, (lineVisits.get(step.line) || 0) + 1);
  }

  // Max visit count indicates loop iteration count
  const maxVisits = Math.max(...Array.from(lineVisits.values()));
  const uniqueLines = lineVisits.size;

  // Estimate input size from first step's array variables
  let inputSize = 0;
  const firstStep = steps[0];
  if (firstStep?.variables) {
    for (const v of firstStep.variables) {
      if (v.dsType === 'array' && Array.isArray(v.value)) {
        inputSize = Math.max(inputSize, v.value.length);
      }
    }
  }

  // Estimate loop nesting depth
  let loopDepth = 0;
  if (inputSize > 0) {
    const n = inputSize;
    const totalSteps = steps.length;
    if (totalSteps > n * n) {
      loopDepth = 3; // cubic or worse
    } else if (totalSteps > n * Math.log2(n + 1) * 2) {
      loopDepth = 2; // quadratic
    } else if (totalSteps > n * 2) {
      loopDepth = 1; // linear-ish with more work
    } else {
      loopDepth = 1;
    }
  } else {
    // No array found; estimate from max visits
    if (maxVisits > 100) loopDepth = 2;
    else if (maxVisits > 10) loopDepth = 1;
  }

  // Calculate estimates
  let time: string;
  let explanation: string;

  if (recursionDetected) {
    if (maxCallDepth > 20) {
      time = 'O(2^n)'; // exponential recursion suspected
      explanation = `Recursion detected with max depth ${maxCallDepth}. Likely exponential.`;
    } else {
      time = 'O(n)'; // linear recursion
      explanation = `Recursion detected with max depth ${maxCallDepth}. Likely linear recursive.`;
    }
  } else if (loopDepth >= 3) {
    time = 'O(n³)';
    explanation = `${steps.length} steps with input size ${inputSize}. Cubic behavior detected.`;
  } else if (loopDepth === 2) {
    time = 'O(n²)';
    explanation = `${steps.length} steps with input size ${inputSize}. Quadratic behavior detected.`;
  } else if (loopDepth === 1 && inputSize > 0) {
    // Check for n*log(n) pattern
    const nlogn = inputSize * Math.log2(inputSize);
    if (steps.length > nlogn * 0.8 && steps.length < nlogn * 2) {
      time = 'O(n log n)';
      explanation = `${steps.length} steps with input size ${inputSize}. Matches n·log(n) pattern.`;
    } else {
      time = 'O(n)';
      explanation = `${steps.length} steps with input size ${inputSize}. Linear behavior.`;
    }
  } else {
    time = steps.length <= 5 ? 'O(1)' : 'O(n)';
    explanation = `${steps.length} total steps across ${uniqueLines} lines. Max line visited ${maxVisits}×.`;
  }

  // Space: count max variables at any step
  let maxVars = 0;
  for (const step of steps) {
    maxVars = Math.max(maxVars, step.variables.length);
  }
  const space = recursionDetected ? `O(n) — ${maxCallDepth} stack frames` :
    maxVars > 20 ? 'O(n)' : 'O(1)';

  return { time, space, explanation, loopDepth, recursionDetected };
}
