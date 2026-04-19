import * as vscode from 'vscode';
import { ExecutionTrace } from '../instrumenter/traceSchema';
import type { AppStructure, RequestTrace } from '../appViz/appTypes';

export class MapMyCodePanel {
  public static currentPanel: MapMyCodePanel | undefined;
  private static readonly viewType = 'mapmycode.visualizer';
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(context: vscode.ExtensionContext): MapMyCodePanel {
    const column = vscode.ViewColumn.Beside;
    if (MapMyCodePanel.currentPanel) {
      MapMyCodePanel.currentPanel.panel.reveal(column);
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
    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables,
    );
  }

  public sendTrace(trace: ExecutionTrace) {
    this.panel.webview.postMessage({ type: 'trace', data: trace });
  }

  public sendError(message: string) {
    this.panel.webview.postMessage({ type: 'error', data: message });
  }

  public sendTemplate(code: string, language: string) {
    this.panel.webview.postMessage({ type: 'template', data: { code, language } });
  }

  public sendAppStructure(structure: AppStructure) {
    this.panel.webview.postMessage({ type: 'appStructure', data: structure });
  }

  public sendRequestTrace(trace: RequestTrace) {
    this.panel.webview.postMessage({ type: 'requestTrace', data: trace });
  }

  public sendAppStatus(running: boolean) {
    this.panel.webview.postMessage({ type: 'appStatus', data: { running } });
  }

  /** Allow external code to receive webview messages */
  public onMessage(callback: (msg: any) => void) {
    this.panel.webview.onDidReceiveMessage(callback, null, this.disposables);
  }

  private handleMessage(msg: any) {
    switch (msg.type) {
      case 'ready':
        break;
      case 'openFile':
        if (msg.path) {
          vscode.workspace.openTextDocument(msg.path).then((doc) =>
            vscode.window.showTextDocument(doc),
          );
        }
        break;
      case 'goToLine': {
        const line = typeof msg.line === 'number' ? msg.line : 1;
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          const range = new vscode.Range(line - 1, 0, line - 1, 0);
          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
          editor.selection = new vscode.Selection(range.start, range.start);
        }
        break;
      }
    }
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
