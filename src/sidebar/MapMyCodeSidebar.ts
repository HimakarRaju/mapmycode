import * as vscode from 'vscode';
import type { CodebaseViewType } from '../codebase/codebaseTypes';
import type { HistoryEntryMeta } from '../history/traceHistory';
import { TraceHistoryStore } from '../history/traceHistory';

interface SidebarItemDefinition {
  id: string;
  label: string;
  description?: string;
  icon?: vscode.ThemeIcon;
  tooltip?: string;
  command?: vscode.Command;
  children?: SidebarItemDefinition[];
}

class SidebarTreeItem extends vscode.TreeItem {
  constructor(public readonly definition: SidebarItemDefinition) {
    super(
      definition.label,
      definition.children?.length
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
    );
    this.id = definition.id;
    this.description = definition.description;
    this.tooltip = definition.tooltip ?? definition.description ?? definition.label;
    this.iconPath = definition.icon;
    this.command = definition.command;
  }
}

export class MapMyCodeExploreProvider implements vscode.TreeDataProvider<SidebarTreeItem> {
  private readonly roots: SidebarItemDefinition[] = [
    {
      id: 'run',
      label: 'Run',
      icon: new vscode.ThemeIcon('play-circle'),
      children: [
        commandItem('run-file', 'Visualize Current File', 'mapmycode.visualize', 'Trace the active JS, TS, or Python file.', new vscode.ThemeIcon('play')),
        commandItem('run-selection', 'Visualize Selection', 'mapmycode.visualizeSelection', 'Trace only the selected code.', new vscode.ThemeIcon('symbol-method')),
        commandItem('open-panel', 'Open Main Panel', 'mapmycode.openPanel', 'Reveal the main MapMyCode visualization panel.', new vscode.ThemeIcon('layout-panel')),
      ],
    },
    {
      id: 'code-maps',
      label: 'Code Maps',
      icon: new vscode.ThemeIcon('graph'),
      children: [
        codebaseItem('dependencies', 'Dependency Network', 'Static import and require relationships between files.', new vscode.ThemeIcon('references')),
        codebaseItem('callGraph', 'Call Graph', 'Static function and method call relationships across the workspace.', new vscode.ThemeIcon('graph-line')),
        codebaseItem('fileTree', 'File Structure', 'Project files and folders.', new vscode.ThemeIcon('files')),
        codebaseItem('classDiagram', 'Class Diagram', 'Classes, inheritance, and members.', new vscode.ThemeIcon('symbol-class')),
        codebaseItem('metrics', 'Code Metrics', 'File counts, line counts, and hotspots.', new vscode.ThemeIcon('dashboard')),
        codebaseItem('gitHistory', 'Git History', 'Recent repository history.', new vscode.ThemeIcon('git-commit')),
      ],
    },
    {
      id: 'apps',
      label: 'Web Apps',
      icon: new vscode.ThemeIcon('globe'),
      children: [
        commandItem('configure-app', 'Setup Web App Tracing', 'mapmycode.configureApp', 'Configure web app settings like port and startup commands.', new vscode.ThemeIcon('gear')),
        commandItem('visualize-app', 'Visualize Web App', 'mapmycode.visualizeApp', 'Inspect routes and live requests for a supported web app.', new vscode.ThemeIcon('globe')),
        commandItem('stop-app', 'Stop Visualized App', 'mapmycode.stopApp', 'Stop the currently instrumented app session.', new vscode.ThemeIcon('debug-stop')),
      ],
    },
  ];

  public readonly onDidChangeTreeData = new vscode.EventEmitter<SidebarTreeItem | undefined | void>().event;

  public getTreeItem(element: SidebarTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: SidebarTreeItem): SidebarTreeItem[] {
    const source = element?.definition.children ?? this.roots;
    return source.map((item) => new SidebarTreeItem(item));
  }
}

export class MapMyCodeHistoryProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private readonly changeSubscription: vscode.Disposable;

  constructor(private readonly historyStore: TraceHistoryStore) {
    this.changeSubscription = historyStore.onDidChange(() => this.refresh());
  }

  public dispose() {
    this.changeSubscription.dispose();
    this.onDidChangeTreeDataEmitter.dispose();
  }

  public refresh() {
    this.onDidChangeTreeDataEmitter.fire();
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(): vscode.TreeItem[] {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const entries = this.historyStore.getEntries(workspaceRoot);

    if (entries.length === 0) {
      const emptyItem = new vscode.TreeItem('No saved traces yet', vscode.TreeItemCollapsibleState.None);
      emptyItem.description = 'Run a trace or code map to populate history.';
      emptyItem.iconPath = new vscode.ThemeIcon('history');
      return [emptyItem];
    }

    return entries.map((entry) => createHistoryItem(entry));
  }
}

function commandItem(id: string, label: string, command: string, description: string, icon: vscode.ThemeIcon): SidebarItemDefinition {
  return {
    id,
    label,
    description,
    tooltip: description,
    icon,
    command: { command, title: label },
  };
}

function codebaseItem(viewType: CodebaseViewType, label: string, description: string, icon: vscode.ThemeIcon): SidebarItemDefinition {
  return {
    id: `code-map-${viewType}`,
    label,
    description,
    tooltip: description,
    icon,
    command: {
      command: 'mapmycode.showCodebaseView',
      title: label,
      arguments: [viewType],
    },
  };
}

function createHistoryItem(entry: HistoryEntryMeta): vscode.TreeItem {
  const item = new vscode.TreeItem(entry.title, vscode.TreeItemCollapsibleState.None);
  item.description = `${formatRelativeTime(entry.timestamp)} - ${entry.description}`;
  item.tooltip = buildHistoryTooltip(entry);
  item.contextValue = 'historyEntry';
  item.id = entry.id;
  item.iconPath = getHistoryIcon(entry.kind);
  item.command = {
    command: 'mapmycode.openHistoryEntry',
    title: entry.title,
    arguments: [entry.id],
  };
  item.contextValue = 'mapmycodeHistoryEntry';
  return item;
}

function getHistoryIcon(kind: HistoryEntryMeta['kind']): vscode.ThemeIcon {
  switch (kind) {
    case 'trace':
      return new vscode.ThemeIcon('pulse');
    case 'codebase':
      return new vscode.ThemeIcon('graph');
    case 'app':
      return new vscode.ThemeIcon('globe');
    default:
      return new vscode.ThemeIcon('history');
  }
}

function buildHistoryTooltip(entry: HistoryEntryMeta): string {
  const parts = [entry.title, entry.description, new Date(entry.timestamp).toLocaleString()];
  if (entry.sourcePath) {
    parts.push(vscode.workspace.asRelativePath(entry.sourcePath, false));
  }
  return parts.join('\n');
}

function formatRelativeTime(timestamp: number): string {
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 60) {
    return 'now';
  }

  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }

  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}