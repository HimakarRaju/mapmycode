import * as path from 'path';
import * as vscode from 'vscode';
import { MapMyCodePanel } from './webview/WebviewProvider';
import { Executor } from './executor/executor';
import { detectFramework } from './appViz/frameworkDetector';
import { analyzeFlaskApp, analyzeFastAPIApp, analyzeExpressApp } from './appViz/routeExtractor';
import { TraceServer } from './appViz/traceServer';
import { AppLauncher } from './appViz/appLauncher';
import type { AppStructure } from './appViz/appTypes';
import { MapMyCodeLensProvider } from './codeLens/CodeLensProvider';
import { BreakpointSync } from './features/breakpointSync';
import { analyzeComplexity } from './features/complexityAnalyzer';
import { Exporter } from './features/exporter';
import { ThemeSync } from './features/themeSync';
import { validateCode } from './features/securitySandbox';
import { buildFileTree } from './codebase/fileStructure';
import { analyzeDependencies } from './codebase/dependencyAnalyzer';
import { analyzeCallGraph } from './codebase/callGraphAnalyzer';
import { RuntimeHighlighter } from './features/runtimeHighlighter';
import { analyzeClasses } from './codebase/classAnalyzer';
import { analyzeCodeMetrics } from './codebase/metricsAnalyzer';
import { getGitHistory } from './codebase/gitHistory';
import type { CodebaseViewType } from './codebase/codebaseTypes';
import { MapMyCodeExploreProvider, MapMyCodeHistoryProvider } from './sidebar/MapMyCodeSidebar';
import { TraceHistoryStore } from './history/traceHistory';

export function activate(context: vscode.ExtensionContext) {
  const executor = new Executor(context);
  const traceServer = new TraceServer();
  const breakpointSync = new BreakpointSync();
  const exporter = new Exporter();
  const themeSync = new ThemeSync();
  const historyStore = new TraceHistoryStore();
  const exploreProvider = new MapMyCodeExploreProvider();
  const historyProvider = new MapMyCodeHistoryProvider(historyStore);
  let appLauncher: AppLauncher | null = null;
  let lastTrace: import('./instrumenter/traceSchema').ExecutionTrace | null = null;
  let playbackMessagePanel: MapMyCodePanel | null = null;
  let appMessagePanel: MapMyCodePanel | null = null;
  let lastCodeEditor: vscode.TextEditor | undefined = isSupportedEditor(vscode.window.activeTextEditor)
    ? vscode.window.activeTextEditor
    : undefined;

  // Register CodeLens provider
  const codeLensProvider = new MapMyCodeLensProvider();
  context.subscriptions.push(
    vscode.window.createTreeView('mapmycode.explore', {
      treeDataProvider: exploreProvider,
      showCollapseAll: false,
    }),
    vscode.window.createTreeView('mapmycode.history', {
      treeDataProvider: historyProvider,
      showCollapseAll: false,
    }),
    vscode.languages.registerCodeLensProvider(
      [{ language: 'javascript' }, { language: 'typescript' }, { language: 'python' }],
      codeLensProvider,
    ),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (isSupportedEditor(editor)) {
        lastCodeEditor = editor;
      }
      RuntimeHighlighter.getInstance().applyHighlights(editor);
    }),
    RuntimeHighlighter.getInstance(),
    breakpointSync,
    themeSync,
    historyStore,
    historyProvider,
  );

  const getWorkspaceRoot = (): string | undefined => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const showCodebaseView = async (viewType: CodebaseViewType) => {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showWarningMessage('MapMyCode: Open a workspace folder first.');
      return;
    }

    const panel = MapMyCodePanel.createOrShow(context);

    try {
      let payload: unknown;
      switch (viewType) {
        case 'fileTree':
          payload = buildFileTree(workspaceRoot);
          break;
        case 'dependencies':
          payload = analyzeDependencies(workspaceRoot);
          break;
        case 'callGraph':
          payload = analyzeCallGraph(workspaceRoot);
          break;
        case 'classDiagram':
          payload = analyzeClasses(workspaceRoot);
          break;
        case 'metrics':
          payload = analyzeCodeMetrics(workspaceRoot);
          break;
        case 'gitHistory':
          payload = await getGitHistory(workspaceRoot);
          break;
        default:
          return;
      }

      panel.sendCodebaseView(viewType, payload);
      historyStore.recordCodebaseView(viewType, payload, workspaceRoot);
    } catch (err: any) {
      panel.sendError(`Codebase analysis failed: ${err.message}`);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('mapmycode.openPanel', () => {
      MapMyCodePanel.createOrShow(context);
    }),

    vscode.commands.registerCommand('mapmycode.refreshHistory', () => {
      historyProvider.refresh();
    }),

    vscode.commands.registerCommand('mapmycode.showCodebaseView', async (viewType: CodebaseViewType) => {
      await showCodebaseView(viewType);
    }),

    vscode.commands.registerCommand('mapmycode.showDependencyNetwork', async () => {
      await showCodebaseView('dependencies');
    }),

    vscode.commands.registerCommand('mapmycode.showCallGraph', async () => {
      await showCodebaseView('callGraph');
    }),

    vscode.commands.registerCommand('mapmycode.openHistoryEntry', async (entryId: string | { id: string }) => {
      const id = typeof entryId === 'string' ? entryId : entryId?.id;
      if (!id) return;
      const snapshot = historyStore.loadEntry(id, getWorkspaceRoot());
      if (!snapshot) {
        vscode.window.showWarningMessage('MapMyCode: Saved trace entry could not be loaded.');
        historyProvider.refresh();
        return;
      }

      const panel = MapMyCodePanel.createOrShow(context);
      switch (snapshot.kind) {
        case 'trace': {
          lastTrace = snapshot.trace;
          panel.sendTrace(snapshot.trace);
          panel.sendComplexity(analyzeComplexity(snapshot.trace));
          const highlighter = RuntimeHighlighter.getInstance();
          highlighter.setTrace(snapshot.trace, snapshot.entry.sourcePath);
          break;
        }
        case 'codebase':
          panel.sendCodebaseView(snapshot.viewType, snapshot.payload);
          break;
        case 'app':
          panel.sendAppStructure(snapshot.structure);
          panel.sendAppStatus(false);
          break;
      }
    }),

    vscode.commands.registerCommand('mapmycode.deleteHistoryEntry', async (entry: any) => {
      if (entry && entry.id) {
        historyStore.deleteEntry(entry.id, getWorkspaceRoot());
      }
    }),

    vscode.commands.registerCommand('mapmycode.clearHistory', async () => {
      const viewType = await vscode.window.showWarningMessage(
        'Are you sure you want to clear all MapMyCode history?',
        'Clear History',
        'Cancel'
      );
      if (viewType === 'Clear History') {
        historyStore.clearHistory(getWorkspaceRoot());
      }
    }),

    vscode.commands.registerCommand('mapmycode.visualize', async () => {
      const editor = resolveTargetEditor(lastCodeEditor);
      if (!editor) {
        vscode.window.showWarningMessage('MapMyCode: No supported code editor found. Focus a JavaScript, TypeScript, or Python file and try again.');
        return;
      }
      lastCodeEditor = editor;
      const code = editor.document.getText();
      const lang = mapLanguageId(editor.document.languageId);
      if (!lang) {
        vscode.window.showWarningMessage('MapMyCode: Unsupported language. Use JavaScript or Python.');
        return;
      }

      // Security validation
      const warnings = validateCode(code, lang);
      if (warnings.length > 0) {
        const proceed = await vscode.window.showWarningMessage(
          `MapMyCode Security Warning:\n${warnings.join('\n')}`,
          'Run Anyway', 'Cancel'
        );
        if (proceed !== 'Run Anyway') return;
      }

      breakpointSync.setSource(editor.document.uri);
      const panel = MapMyCodePanel.createOrShow(context);

      if (playbackMessagePanel !== panel) {
        panel.onMessage((msg) => {
          if (msg.type === 'checkBreakpoint') {
            const shouldPause = breakpointSync.shouldPause(msg.line);
            panel.sendBreakpointHit(msg.line, shouldPause);
          }
        });
        playbackMessagePanel = panel;
      }

      try {
        const trace = await executor.execute(code, lang, editor.document.uri.fsPath);
        lastTrace = trace;
        panel.sendTrace(trace);

        // Send complexity analysis
        const complexity = analyzeComplexity(trace);
        panel.sendComplexity(complexity);
        historyStore.recordTrace(trace, { sourcePath: editor.document.uri.fsPath });
        
        RuntimeHighlighter.getInstance().setTrace(trace, editor.document.uri.fsPath);
      } catch (err: any) {
        panel.sendError(err.message ?? String(err));
      }
    }),

    vscode.commands.registerCommand('mapmycode.visualizeSelection', async () => {
      const editor = resolveTargetEditor(lastCodeEditor);
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage('MapMyCode: No selection found in the current code editor.');
        return;
      }
      lastCodeEditor = editor;
      const code = editor.document.getText(editor.selection);
      const lang = mapLanguageId(editor.document.languageId);
      if (!lang) {
        vscode.window.showWarningMessage('MapMyCode: Unsupported language.');
        return;
      }
      const panel = MapMyCodePanel.createOrShow(context);
      try {
        const trace = await executor.execute(code, lang, editor.document.uri.fsPath);
        lastTrace = trace;
        panel.sendTrace(trace);
        panel.sendComplexity(analyzeComplexity(trace));
        historyStore.recordTrace(trace, {
          sourcePath: editor.document.uri.fsPath,
          title: `Selection: ${path.basename(editor.document.uri.fsPath)}`,
        });
        
        RuntimeHighlighter.getInstance().setTrace(trace, editor.document.uri.fsPath);
      } catch (err: any) {
        panel.sendError(err.message ?? String(err));
      }
    }),

    vscode.commands.registerCommand('mapmycode.openTemplates', async () => {
      const templates = getTemplateList();
      const pick = await vscode.window.showQuickPick(templates, {
        placeHolder: 'Select an algorithm template...',
      });
      if (pick) {
        const panel = MapMyCodePanel.createOrShow(context);
        panel.sendTemplate(pick.detail ?? '', pick.description ?? 'javascript');
      }
    }),

    vscode.commands.registerCommand('mapmycode.configureApp', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'mapmycode.appViz');
    }),

    vscode.commands.registerCommand('mapmycode.visualizeApp', async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('MapMyCode: Open a workspace folder first.');
        return;
      }

      const rootPath = workspaceFolders[0].uri.fsPath;
      const framework = await detectFramework(rootPath);

      if (!framework) {
        vscode.window.showWarningMessage(
          'MapMyCode: Could not detect a supported web framework (Flask, FastAPI, Express, etc.).',
        );
        return;
      }

      vscode.window.showInformationMessage(`MapMyCode: Detected ${framework.name} app.`);

      // Analyze the project structure
      let structure: AppStructure;
      try {
        switch (framework.type) {
          case 'flask':
            structure = analyzeFlaskApp(rootPath, framework.entryFile);
            break;
          case 'fastapi':
            structure = analyzeFastAPIApp(rootPath, framework.entryFile);
            break;
          case 'express':
          case 'koa':
          case 'nestjs':
            structure = analyzeExpressApp(rootPath, framework.entryFile);
            break;
          default:
            vscode.window.showWarningMessage(`MapMyCode: ${framework.name} analysis not yet supported.`);
            return;
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`MapMyCode: Failed to analyze app — ${err.message}`);
        return;
      }

      const panel = MapMyCodePanel.createOrShow(context);
      panel.sendAppStructure(structure);
      historyStore.recordAppStructure(structure, rootPath);

      // Start trace server for live request monitoring
      try {
        const port = await traceServer.start();
        traceServer.setOnTrace((trace) => {
          panel.sendRequestTrace(trace);
        });

        // Create launcher
        appLauncher = new AppLauncher(context.extensionPath);

        if (appMessagePanel !== panel) {
          panel.onMessage((msg) => {
            if (msg.type === 'startApp') {
              appLauncher?.launch(framework, port).then(() => {
                panel.sendAppStatus(true);
              }).catch((err) => {
                panel.sendError(`Failed to start app: ${err.message}`);
              });
            }
            if (msg.type === 'stopApp') {
              appLauncher?.stop();
              panel.sendAppStatus(false);
            }
          });
          appMessagePanel = panel;
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`MapMyCode: Failed to start trace server — ${err.message}`);
      }
    }),

    vscode.commands.registerCommand('mapmycode.stopApp', () => {
      if (appLauncher?.isRunning) {
        appLauncher.stop();
        vscode.window.showInformationMessage('MapMyCode: App stopped.');
      }
      traceServer.stop();
    }),

    // Export commands
    vscode.commands.registerCommand('mapmycode.exportHTML', async () => {
      if (!lastTrace) {
        vscode.window.showWarningMessage('MapMyCode: No trace to export. Run a visualization first.');
        return;
      }
      await exporter.exportHTML(lastTrace);
    }),

    vscode.commands.registerCommand('mapmycode.exportJSON', async () => {
      if (!lastTrace) {
        vscode.window.showWarningMessage('MapMyCode: No trace to export. Run a visualization first.');
        return;
      }
      await exporter.exportJSON(lastTrace);
    }),

    vscode.commands.registerCommand('mapmycode.exportMarkdown', async (step?: number) => {
      if (!lastTrace) {
        vscode.window.showWarningMessage('MapMyCode: No trace to export. Run a visualization first.');
        return;
      }
      await exporter.exportMarkdownReport(lastTrace, step);
    }),

    // Codebase visualization commands
    vscode.commands.registerCommand('mapmycode.visualizeCodebase', async () => {
      const viewType = await vscode.window.showQuickPick([
        { label: '$(references) Dependency Network', description: 'dependencies' },
        { label: '$(graph) Call Graph', description: 'callGraph' },
        { label: '$(files) File Structure', description: 'fileTree' },
        { label: '$(symbol-class) Class Diagram', description: 'classDiagram' },
        { label: '$(dashboard) Code Metrics', description: 'metrics' },
        { label: '$(git-commit) Git History', description: 'gitHistory' },
      ], { placeHolder: 'Choose codebase visualization...' });

      if (!viewType) return;

      await showCodebaseView(viewType.description as CodebaseViewType);
    }),
  );
}

export function deactivate() {}

function resolveTargetEditor(lastCodeEditor?: vscode.TextEditor): vscode.TextEditor | undefined {
  if (isSupportedEditor(vscode.window.activeTextEditor)) {
    return vscode.window.activeTextEditor;
  }

  if (isSupportedEditor(lastCodeEditor) && vscode.window.visibleTextEditors.includes(lastCodeEditor)) {
    return lastCodeEditor;
  }

  return vscode.window.visibleTextEditors.find((editor) => isSupportedEditor(editor));
}

function isSupportedEditor(editor: vscode.TextEditor | undefined): editor is vscode.TextEditor {
  if (!editor) {
    return false;
  }

  const scheme = editor.document.uri.scheme;
  if (scheme !== 'file' && scheme !== 'untitled') {
    return false;
  }

  return mapLanguageId(editor.document.languageId) !== null;
}

function mapLanguageId(langId: string): 'javascript' | 'python' | null {
  if (langId === 'javascript' || langId === 'typescript' || langId === 'javascriptreact' || langId === 'typescriptreact') {
    return 'javascript';
  }
  if (langId === 'python') {
    return 'python';
  }
  return null;
}

function getTemplateList(): vscode.QuickPickItem[] {
  return [
    { label: '$(symbol-array) Bubble Sort', description: 'javascript', detail: TEMPLATES.bubbleSort },
    { label: '$(symbol-array) Binary Search', description: 'javascript', detail: TEMPLATES.binarySearch },
    { label: '$(symbol-array) Insertion Sort', description: 'javascript', detail: TEMPLATES.insertionSort },
    { label: '$(symbol-array) Selection Sort', description: 'javascript', detail: TEMPLATES.selectionSort },
    { label: '$(symbol-array) Merge Sort', description: 'javascript', detail: TEMPLATES.mergeSort },
    { label: '$(symbol-array) Quick Sort', description: 'javascript', detail: TEMPLATES.quickSort },
    { label: '$(symbol-class) Linked List', description: 'javascript', detail: TEMPLATES.linkedList },
    { label: '$(symbol-structure) Binary Tree (BFS)', description: 'javascript', detail: TEMPLATES.binaryTreeBFS },
    { label: '$(symbol-structure) Binary Search Tree', description: 'javascript', detail: TEMPLATES.bst },
    { label: '$(symbol-array) Stack Operations', description: 'javascript', detail: TEMPLATES.stack },
    { label: '$(symbol-array) Queue Operations', description: 'javascript', detail: TEMPLATES.queue },
    { label: '$(symbol-misc) Fibonacci (Recursion)', description: 'javascript', detail: TEMPLATES.fibonacci },
    { label: '$(symbol-misc) Fibonacci (DP)', description: 'javascript', detail: TEMPLATES.fibonacciDP },
    { label: '$(symbol-structure) Graph DFS', description: 'javascript', detail: TEMPLATES.graphDFS },
    { label: '$(symbol-structure) Graph BFS', description: 'javascript', detail: TEMPLATES.graphBFS },
    { label: '$(symbol-structure) Dijkstra', description: 'javascript', detail: TEMPLATES.dijkstra },
    { label: '$(symbol-key) Hash Map', description: 'javascript', detail: TEMPLATES.hashMap },
    { label: '$(symbol-misc) Two Pointers', description: 'javascript', detail: TEMPLATES.twoPointers },
    { label: '$(symbol-misc) Sliding Window', description: 'javascript', detail: TEMPLATES.slidingWindow },
  ];
}

const TEMPLATES = {
  bubbleSort: `function bubbleSort(arr) {
  for (let i = 0; i < arr.length; i++) {
    for (let j = 0; j < arr.length - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        let temp = arr[j];
        arr[j] = arr[j + 1];
        arr[j + 1] = temp;
      }
    }
  }
  return arr;
}
bubbleSort([5, 3, 8, 1, 2]);`,

  binarySearch: `function binarySearch(arr, target) {
  let left = 0, right = arr.length - 1;
  while (left <= right) {
    let mid = Math.floor((left + right) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  return -1;
}
binarySearch([1, 3, 5, 7, 9, 11], 7);`,

  linkedList: `class ListNode {
  constructor(val) {
    this.val = val;
    this.next = null;
  }
}
let head = new ListNode(1);
head.next = new ListNode(2);
head.next.next = new ListNode(3);
head.next.next.next = new ListNode(4);
// Traverse
let current = head;
while (current) {
  current = current.next;
}`,

  binaryTreeBFS: `class TreeNode {
  constructor(val) {
    this.val = val;
    this.left = null;
    this.right = null;
  }
}
let root = new TreeNode(1);
root.left = new TreeNode(2);
root.right = new TreeNode(3);
root.left.left = new TreeNode(4);
root.left.right = new TreeNode(5);
// BFS
let queue = [root];
while (queue.length > 0) {
  let node = queue.shift();
  if (node.left) queue.push(node.left);
  if (node.right) queue.push(node.right);
}`,

  stack: `let stack = [];
stack.push(10);
stack.push(20);
stack.push(30);
let top = stack.pop();
stack.push(40);
top = stack.pop();
top = stack.pop();`,

  queue: `let queue = [];
queue.push(10);
queue.push(20);
queue.push(30);
let front = queue.shift();
queue.push(40);
front = queue.shift();
front = queue.shift();`,

  fibonacci: `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
fibonacci(5);`,

  graphDFS: `function dfs(graph, node, visited) {
  if (visited.has(node)) return;
  visited.add(node);
  for (let neighbor of graph[node]) {
    dfs(graph, neighbor, visited);
  }
}
let graph = {
  A: ['B', 'C'],
  B: ['D'],
  C: ['E'],
  D: [],
  E: ['F'],
  F: []
};
dfs(graph, 'A', new Set());`,

  insertionSort: `function insertionSort(arr) {
  for (let i = 1; i < arr.length; i++) {
    let key = arr[i];
    let j = i - 1;
    while (j >= 0 && arr[j] > key) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = key;
  }
  return arr;
}
insertionSort([5, 3, 8, 1, 2, 9, 4]);`,

  selectionSort: `function selectionSort(arr) {
  for (let i = 0; i < arr.length - 1; i++) {
    let minIdx = i;
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[j] < arr[minIdx]) minIdx = j;
    }
    let temp = arr[i];
    arr[i] = arr[minIdx];
    arr[minIdx] = temp;
  }
  return arr;
}
selectionSort([5, 3, 8, 1, 2]);`,

  mergeSort: `function mergeSort(arr) {
  if (arr.length <= 1) return arr;
  let mid = Math.floor(arr.length / 2);
  let left = mergeSort(arr.slice(0, mid));
  let right = mergeSort(arr.slice(mid));
  return merge(left, right);
}
function merge(left, right) {
  let result = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) result.push(left[i++]);
    else result.push(right[j++]);
  }
  return result.concat(left.slice(i)).concat(right.slice(j));
}
mergeSort([5, 3, 8, 1, 2, 9, 4]);`,

  quickSort: `function quickSort(arr, lo, hi) {
  if (lo === undefined) lo = 0;
  if (hi === undefined) hi = arr.length - 1;
  if (lo >= hi) return arr;
  let pivot = arr[hi];
  let i = lo;
  for (let j = lo; j < hi; j++) {
    if (arr[j] < pivot) {
      let tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      i++;
    }
  }
  let tmp = arr[i]; arr[i] = arr[hi]; arr[hi] = tmp;
  quickSort(arr, lo, i - 1);
  quickSort(arr, i + 1, hi);
  return arr;
}
quickSort([5, 3, 8, 1, 2, 9, 4]);`,

  bst: `class TreeNode {
  constructor(val) { this.val = val; this.left = null; this.right = null; }
}
function insert(root, val) {
  if (!root) return new TreeNode(val);
  if (val < root.val) root.left = insert(root.left, val);
  else root.right = insert(root.right, val);
  return root;
}
function search(root, val) {
  if (!root) return false;
  if (val === root.val) return true;
  if (val < root.val) return search(root.left, val);
  return search(root.right, val);
}
let root = null;
for (let v of [5, 3, 7, 1, 4, 6, 8]) {
  root = insert(root, v);
}
search(root, 4);`,

  fibonacciDP: `function fibDP(n) {
  let dp = [0, 1];
  for (let i = 2; i <= n; i++) {
    dp[i] = dp[i - 1] + dp[i - 2];
  }
  return dp[n];
}
fibDP(10);`,

  graphBFS: `function bfs(graph, start) {
  let visited = new Set();
  let queue = [start];
  visited.add(start);
  let order = [];
  while (queue.length > 0) {
    let node = queue.shift();
    order.push(node);
    for (let neighbor of graph[node]) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return order;
}
let graph = { A: ['B','C'], B: ['D','E'], C: ['F'], D: [], E: ['F'], F: [] };
bfs(graph, 'A');`,

  dijkstra: `function dijkstra(graph, start) {
  let dist = {};
  let visited = new Set();
  for (let node in graph) dist[node] = Infinity;
  dist[start] = 0;
  while (visited.size < Object.keys(graph).length) {
    let u = null;
    for (let node in dist) {
      if (!visited.has(node) && (u === null || dist[node] < dist[u])) u = node;
    }
    if (u === null || dist[u] === Infinity) break;
    visited.add(u);
    for (let [neighbor, weight] of graph[u]) {
      let alt = dist[u] + weight;
      if (alt < dist[neighbor]) dist[neighbor] = alt;
    }
  }
  return dist;
}
let graph = {
  A: [['B',4],['C',2]], B: [['D',3],['C',1]], C: [['B',1],['D',5]], D: []
};
dijkstra(graph, 'A');`,

  hashMap: `let map = {};
map['apple'] = 3;
map['banana'] = 5;
map['cherry'] = 2;
map['apple'] = map['apple'] + 1;
let keys = Object.keys(map);
let total = 0;
for (let key of keys) {
  total += map[key];
}`,

  twoPointers: `function twoSum(arr, target) {
  let left = 0, right = arr.length - 1;
  while (left < right) {
    let sum = arr[left] + arr[right];
    if (sum === target) return [left, right];
    if (sum < target) left++;
    else right--;
  }
  return [-1, -1];
}
twoSum([1, 2, 3, 4, 6, 8, 11], 10);`,

  slidingWindow: `function maxSumSubarray(arr, k) {
  let maxSum = 0, windowSum = 0;
  for (let i = 0; i < k; i++) windowSum += arr[i];
  maxSum = windowSum;
  for (let i = k; i < arr.length; i++) {
    windowSum += arr[i] - arr[i - k];
    if (windowSum > maxSum) maxSum = windowSum;
  }
  return maxSum;
}
maxSumSubarray([2, 1, 5, 1, 3, 2], 3);`,
};
