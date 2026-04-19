/** Execution trace schema — shared between extension host and webview. */

export type SupportedLanguage = 'javascript' | 'python';

export type TraceEventType = 'line' | 'call' | 'return' | 'exception';

export type DataStructureType =
  | 'array'
  | 'array2d'
  | 'linkedList'
  | 'binaryTree'
  | 'stack'
  | 'queue'
  | 'hashMap'
  | 'graph'
  | 'set'
  | 'primitive'
  | 'object'
  | 'unknown';

export interface TrackedVariable {
  name: string;
  value: any;
  type: string;
  dsType: DataStructureType;
}

export interface TraceStep {
  step: number;
  line: number;
  event: TraceEventType;
  variables: TrackedVariable[];
  functionName?: string;
  args?: any[];
  returnValue?: any;
  stdout?: string;
}

export interface AnnotationConfig {
  hist?: string[];
  ignoreFunctionTree?: string[];
  functionTreeOnce?: string[];
  skipFunction?: string[];
}

export interface ExecutionTrace {
  language: SupportedLanguage;
  code: string;
  steps: TraceStep[];
  annotations: AnnotationConfig;
  error?: string;
  totalSteps: number;
}
