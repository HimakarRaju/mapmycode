import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { AppStructure } from '../appViz/appTypes';
import type { CodebaseViewType } from '../codebase/codebaseTypes';
import type { ExecutionTrace } from '../instrumenter/traceSchema';
import { getArtifactDirectory } from '../utils/artifactDirectory';

const HISTORY_DIR_NAME = 'history';
const HISTORY_INDEX_FILE = 'index.json';
const MAX_HISTORY_ENTRIES = 30;

export type HistoryEntryKind = 'trace' | 'codebase' | 'app';

export interface HistoryEntryMeta {
  id: string;
  kind: HistoryEntryKind;
  title: string;
  description: string;
  timestamp: number;
  sourcePath?: string;
  language?: string;
  viewType?: CodebaseViewType;
  framework?: string;
  snapshotFile: string;
}

export interface StoredTraceEntry {
  kind: 'trace';
  entry: HistoryEntryMeta;
  trace: ExecutionTrace;
}

export interface StoredCodebaseEntry {
  kind: 'codebase';
  entry: HistoryEntryMeta;
  viewType: CodebaseViewType;
  payload: unknown;
}

export interface StoredAppEntry {
  kind: 'app';
  entry: HistoryEntryMeta;
  structure: AppStructure;
}

export type StoredHistoryEntry = StoredTraceEntry | StoredCodebaseEntry | StoredAppEntry;

interface RecordTraceOptions {
  sourcePath?: string;
  title?: string;
}

export class TraceHistoryStore implements vscode.Disposable {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChange = this.onDidChangeEmitter.event;

  public dispose() {
    this.onDidChangeEmitter.dispose();
  }

  public getEntries(preferredRoot?: string): HistoryEntryMeta[] {
    return this.readIndex(preferredRoot);
  }

  public loadEntry(id: string, preferredRoot?: string): StoredHistoryEntry | undefined {
    const entry = this.readIndex(preferredRoot).find((item) => item.id === id);
    if (!entry) {
      return undefined;
    }

    const snapshotPath = path.join(this.getHistoryDirectory(preferredRoot), entry.snapshotFile);
    if (!fs.existsSync(snapshotPath)) {
      return undefined;
    }

    try {
      return JSON.parse(fs.readFileSync(snapshotPath, 'utf-8')) as StoredHistoryEntry;
    } catch {
      return undefined;
    }
  }

  public recordTrace(trace: ExecutionTrace, options: RecordTraceOptions = {}): HistoryEntryMeta {
    const fileName = options.sourcePath ? path.basename(options.sourcePath) : 'Untitled';
    const entry: HistoryEntryMeta = {
      id: createEntryId(),
      kind: 'trace',
      title: options.title ?? `Trace: ${fileName}`,
      description: `${trace.language} - ${trace.totalSteps} steps`,
      timestamp: Date.now(),
      sourcePath: options.sourcePath,
      language: trace.language,
      snapshotFile: '',
    };

    return this.writeSnapshot(
      entry,
      {
        kind: 'trace',
        entry,
        trace,
      },
      options.sourcePath,
    );
  }

  public recordCodebaseView(viewType: CodebaseViewType, payload: unknown, rootPath: string): HistoryEntryMeta {
    const entry: HistoryEntryMeta = {
      id: createEntryId(),
      kind: 'codebase',
      title: `Code Map: ${getCodebaseViewLabel(viewType)}`,
      description: path.basename(rootPath) || rootPath,
      timestamp: Date.now(),
      viewType,
      sourcePath: rootPath,
      snapshotFile: '',
    };

    return this.writeSnapshot(
      entry,
      {
        kind: 'codebase',
        entry,
        viewType,
        payload,
      },
      rootPath,
    );
  }

  public recordAppStructure(structure: AppStructure, rootPath: string): HistoryEntryMeta {
    const entry: HistoryEntryMeta = {
      id: createEntryId(),
      kind: 'app',
      title: `App Map: ${structure.framework}`,
      description: path.basename(rootPath) || rootPath,
      timestamp: Date.now(),
      sourcePath: rootPath,
      framework: structure.framework,
      snapshotFile: '',
    };

    return this.writeSnapshot(
      entry,
      {
        kind: 'app',
        entry,
        structure,
      },
      rootPath,
    );
  }

  private writeSnapshot(entry: HistoryEntryMeta, payload: StoredHistoryEntry, preferredRoot?: string): HistoryEntryMeta {
    const historyDirectory = this.getHistoryDirectory(preferredRoot);
    fs.mkdirSync(historyDirectory, { recursive: true });

    const finalizedEntry: HistoryEntryMeta = {
      ...entry,
      snapshotFile: `${entry.id}.json`,
    };
    const snapshotPath = path.join(historyDirectory, finalizedEntry.snapshotFile);

    const normalizedPayload = {
      ...payload,
      entry: finalizedEntry,
    } as StoredHistoryEntry;

    fs.writeFileSync(snapshotPath, JSON.stringify(normalizedPayload, null, 2), 'utf-8');

    const previousEntries = this.readIndex(preferredRoot).filter((item) => item.id !== finalizedEntry.id);
    const nextEntries = [finalizedEntry, ...previousEntries];
    const trimmedEntries = nextEntries.slice(0, MAX_HISTORY_ENTRIES);
    this.writeIndex(trimmedEntries, preferredRoot);

    for (const staleEntry of nextEntries.slice(MAX_HISTORY_ENTRIES)) {
      const stalePath = path.join(historyDirectory, staleEntry.snapshotFile);
      if (fs.existsSync(stalePath)) {
        fs.unlinkSync(stalePath);
      }
    }

    this.onDidChangeEmitter.fire();
    return finalizedEntry;
  }

  private readIndex(preferredRoot?: string): HistoryEntryMeta[] {
    const indexPath = this.getIndexPath(preferredRoot);
    if (!fs.existsSync(indexPath)) {
      return [];
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as HistoryEntryMeta[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  public deleteEntry(id: string, preferredRoot?: string) {
    const entries = this.readIndex(preferredRoot);
    const index = entries.findIndex((item) => item.id === id);
    if (index === -1) {
      return;
    }

    const [entry] = entries.splice(index, 1);
    this.writeIndex(entries, preferredRoot);

    const snapshotPath = path.join(this.getHistoryDirectory(preferredRoot), entry.snapshotFile);
    if (fs.existsSync(snapshotPath)) {
      try {
        fs.unlinkSync(snapshotPath);
      } catch (err) {
        console.error('Failed to delete snapshot file', err);
      }
    }

    this.onDidChangeEmitter.fire();
  }

  public clearHistory(preferredRoot?: string) {
    const historyDir = this.getHistoryDirectory(preferredRoot);
    if (fs.existsSync(historyDir)) {
      try {
        fs.rmSync(historyDir, { recursive: true, force: true });
      } catch (err) {
        console.error('Failed to clear history directory', err);
      }
    }
    this.onDidChangeEmitter.fire();
  }

  private writeIndex(entries: HistoryEntryMeta[], preferredRoot?: string) {
    const historyDirectory = this.getHistoryDirectory(preferredRoot);
    fs.mkdirSync(historyDirectory, { recursive: true });
    fs.writeFileSync(this.getIndexPath(preferredRoot), JSON.stringify(entries, null, 2), 'utf-8');
  }

  private getHistoryDirectory(preferredRoot?: string): string {
    return path.join(getArtifactDirectory(resolveHistoryRoot(preferredRoot)), HISTORY_DIR_NAME);
  }

  private getIndexPath(preferredRoot?: string): string {
    return path.join(this.getHistoryDirectory(preferredRoot), HISTORY_INDEX_FILE);
  }
}

export function getCodebaseViewLabel(viewType: CodebaseViewType): string {
  switch (viewType) {
    case 'dependencies':
      return 'Dependency Network';
    case 'callGraph':
      return 'Call Graph';
    case 'fileTree':
      return 'File Structure';
    case 'classDiagram':
      return 'Class Diagram';
    case 'metrics':
      return 'Code Metrics';
    case 'gitHistory':
      return 'Git History';
    default:
      return viewType;
  }
}

function createEntryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolveHistoryRoot(preferredPath?: string): string | undefined {
  if (!preferredPath) {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  const resourceUri = vscode.Uri.file(preferredPath);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(resourceUri);
  if (workspaceFolder) {
    return workspaceFolder.uri.fsPath;
  }

  try {
    return fs.statSync(preferredPath).isDirectory() ? preferredPath : path.dirname(preferredPath);
  } catch {
    return path.dirname(preferredPath);
  }
}