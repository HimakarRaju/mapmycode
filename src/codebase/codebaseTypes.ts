/** Shared types for codebase visualization features. */

export interface FileNode {
  name: string;
  path: string;
  size: number; // bytes
  type: 'file' | 'directory';
  children?: FileNode[];
  language?: string;
}

export interface DependencyEdge {
  from: string; // file path
  to: string;   // imported module/file
  type: 'import' | 'require' | 'dynamic';
}

export interface DependencyGraph {
  nodes: string[];
  edges: DependencyEdge[];
}

export interface CallGraphNode {
  name: string;
  file: string;
  line: number;
}

export interface CallGraphEdge {
  caller: string;
  callee: string;
}

export interface CallGraph {
  nodes: CallGraphNode[];
  edges: CallGraphEdge[];
}

export interface ClassInfo {
  name: string;
  file: string;
  line: number;
  methods: string[];
  properties: string[];
  extends?: string;
  implements?: string[];
}

export interface CodeMetrics {
  files: number;
  totalLines: number;
  languages: Record<string, { files: number; lines: number }>;
  largest: { file: string; lines: number }[];
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
  filesChanged: number;
}

export type CodebaseViewType =
  | 'fileTree'
  | 'dependencies'
  | 'callGraph'
  | 'classDiagram'
  | 'gitHistory'
  | 'metrics';
