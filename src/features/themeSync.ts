/**
 * Theme synchronization — responds to VS Code theme changes and 
 * signals the webview to re-render. The webview uses CSS variables
 * from VS Code so most theming is automatic, but this module 
 * handles detecting when the theme changes and notifying the webview.
 */
import * as vscode from 'vscode';
import { MapMyCodePanel } from '../webview/WebviewProvider';

export class ThemeSync implements vscode.Disposable {
  private disposable: vscode.Disposable;

  constructor() {
    this.disposable = vscode.window.onDidChangeActiveColorTheme((_theme) => {
      // Webview uses CSS variables so it auto-adapts.
      // If the panel exists, send a theme-changed message so React can
      // force a re-render of canvas-based (SVG) elements that may cache colors.
      const panel = MapMyCodePanel.currentPanel;
      if (panel) {
        (panel as any).panel?.webview?.postMessage({ type: 'themeChanged' });
      }
    });
  }

  dispose() {
    this.disposable.dispose();
  }
}
