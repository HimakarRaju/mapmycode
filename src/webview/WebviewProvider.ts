import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ExecutionTrace } from '../instrumenter/traceSchema';
import type { AppStructure, RequestTrace } from '../appViz/appTypes';
import { RuntimeHighlighter } from '../features/runtimeHighlighter';

export class MapMyCodePanel {
  public static currentPanel: MapMyCodePanel | undefined;
  private static readonly viewType = 'mapmycode.visualizer';
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private isReady = false;
  private pendingMessages: Array<{ type: string; data: unknown }> = [];
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(context: vscode.ExtensionContext): MapMyCodePanel {
    const column = vscode.ViewColumn.Beside;
    if (MapMyCodePanel.currentPanel) {
      // Reveal the panel in its current column if possible, otherwise Beside
      const targetColumn = MapMyCodePanel.currentPanel.panel.viewColumn ?? column;
      MapMyCodePanel.currentPanel.panel.reveal(targetColumn, true);
      return MapMyCodePanel.currentPanel;
    }
    const panel = vscode.window.createWebviewPanel(
      MapMyCodePanel.viewType,
      'MapMyCode',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
      },
    );
    MapMyCodePanel.currentPanel = new MapMyCodePanel(panel, context.extensionUri);
    return MapMyCodePanel.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables,
    );
    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public sendTrace(trace: ExecutionTrace) {
    this.postMessage('trace', trace);
  }

  public sendError(message: string) {
    this.postMessage('error', message);
  }

  public sendTemplate(code: string, language: string) {
    this.postMessage('template', { code, language });
  }

  public sendAppStructure(structure: AppStructure) {
    this.postMessage('appStructure', structure);
  }

  public sendRequestTrace(trace: RequestTrace) {
    this.postMessage('requestTrace', trace);
  }

  public sendAppStatus(running: boolean) {
    this.postMessage('appStatus', { running });
  }

  public sendCodebaseView(view: string, payload: unknown) {
    this.postMessage('codebaseView', { view, payload });
  }

  public sendComplexity(data: unknown) {
    this.postMessage('complexity', data);
  }

  public sendBreakpointHit(line: number, shouldPause: boolean) {
    this.postMessage('breakpointHit', { line, shouldPause });
  }

  /** Allow external code to receive webview messages */
  public onMessage(callback: (msg: any) => void) {
    this.panel.webview.onDidReceiveMessage(callback, null, this.disposables);
  }

  private handleMessage(msg: any) {
    switch (msg.type) {
      case 'exportMarkdownStep':
        vscode.commands.executeCommand('mapmycode.exportMarkdown', msg.step);
        break;
      case 'exportHTML':
        vscode.commands.executeCommand('mapmycode.exportHTML');
        break;
      case 'exportJSON':
        vscode.commands.executeCommand('mapmycode.exportJSON');
        break;
      case 'ready':
        this.isReady = true;
        this.flushPendingMessages();
        break;
      case 'openFile':
        if (msg.path) {
          void this.openRequestedFile(msg.path, msg.line);
        }
        break;
      case 'goToLine': {
        const line = typeof msg.line === 'number' ? msg.line : 1;
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          const range = new vscode.Range(line - 1, 0, line - 1, 0);
          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
          editor.selection = new vscode.Selection(range.start, range.start);
          const highlighter = RuntimeHighlighter.getInstance();
          highlighter.applyHighlights(editor);
          highlighter.setActiveLine(line);
        }
        break;
      }
    }
  }

  private postMessage(type: string, data: unknown) {
    const message = { type, data };
    if (!this.isReady) {
      this.pendingMessages.push(message);
      return;
    }
    this.panel.webview.postMessage(message);
  }

  private async openRequestedFile(requestedPath: string, requestedLine?: number) {
    const resolvedPath = this.resolveWorkspacePath(requestedPath);
    if (!resolvedPath) {
      vscode.window.showWarningMessage(`MapMyCode: Could not resolve file: ${requestedPath}`);
      return;
    }

    try {
      const document = await vscode.workspace.openTextDocument(resolvedPath);
      const editor = await vscode.window.showTextDocument(document);
      if (typeof requestedLine === 'number' && requestedLine > 0) {
        const range = new vscode.Range(requestedLine - 1, 0, requestedLine - 1, 0);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        editor.selection = new vscode.Selection(range.start, range.start);
      }
    } catch (error: any) {
      vscode.window.showWarningMessage(`MapMyCode: Unable to open ${requestedPath} (${error.message ?? String(error)})`);
    }
  }

  private resolveWorkspacePath(requestedPath: string): string | undefined {
    if (!requestedPath) {
      return undefined;
    }

    const normalizedPath = requestedPath.replace(/^file:\/\//i, '').replace(/\//g, path.sep);
    if (path.isAbsolute(normalizedPath) && fs.existsSync(normalizedPath)) {
      return normalizedPath;
    }

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const candidate = path.join(folder.uri.fsPath, normalizedPath);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return undefined;
  }

  private flushPendingMessages() {
    if (!this.isReady || this.pendingMessages.length === 0) {
      return;
    }

    for (const message of this.pendingMessages) {
      this.panel.webview.postMessage(message);
    }
    this.pendingMessages = [];
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'),
    );
    const nonce = getNonce();

    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MapMyCode</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    #root {
      width: 100vw;
      height: 100vh;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private dispose() {
    MapMyCodePanel.currentPanel = undefined;
    this.isReady = false;
    this.pendingMessages = [];
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      d?.dispose();
    }
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
