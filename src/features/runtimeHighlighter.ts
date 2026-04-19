import * as vscode from 'vscode';
import type { ExecutionTrace } from '../instrumenter/traceSchema';

export class RuntimeHighlighter implements vscode.Disposable {
  private static instance: RuntimeHighlighter;

  private executedLineDecoration: vscode.TextEditorDecorationType;
  private hotLoopDecoration: vscode.TextEditorDecorationType;
  private activeLineDecoration: vscode.TextEditorDecorationType;

  private currentTracePath?: string;
  private lineExecutionCounts: Map<number, number> = new Map();

  constructor() {
    this.executedLineDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor('merge.currentHeaderBackground'),
      overviewRulerColor: new vscode.ThemeColor('merge.currentHeaderBackground'),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });

    this.hotLoopDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor('editor.wordHighlightStrongBackground'),
      overviewRulerColor: new vscode.ThemeColor('editor.wordHighlightStrongBackground'),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      fontWeight: 'bold',
    });

    this.activeLineDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor('editor.findMatchBackground'),
      border: '1px solid',
      borderColor: new vscode.ThemeColor('editor.findMatchBorder'),
    });
  }

  public static getInstance(): RuntimeHighlighter {
    if (!RuntimeHighlighter.instance) {
      RuntimeHighlighter.instance = new RuntimeHighlighter();
    }
    return RuntimeHighlighter.instance;
  }

  public setTrace(trace: ExecutionTrace, sourcePath?: string) {
    this.currentTracePath = sourcePath;
    this.lineExecutionCounts.clear();

    for (const step of trace.steps) {
      if (step.line && step.line > 0) {
        const count = this.lineExecutionCounts.get(step.line) || 0;
        this.lineExecutionCounts.set(step.line, count + 1);
      }
    }

    this.applyHighlights();
  }

  public setActiveLine(line: number) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || (this.currentTracePath && editor.document.uri.fsPath !== this.currentTracePath)) {
      return;
    }

    const range = new vscode.Range(line - 1, 0, line - 1, 0);
    editor.setDecorations(this.activeLineDecoration, [range]);
  }

  public clearActiveLine() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      editor.setDecorations(this.activeLineDecoration, []);
    }
  }

  public clearAll() {
    this.lineExecutionCounts.clear();
    this.currentTracePath = undefined;
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      editor.setDecorations(this.executedLineDecoration, []);
      editor.setDecorations(this.hotLoopDecoration, []);
      editor.setDecorations(this.activeLineDecoration, []);
    }
  }

  public applyHighlights(editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor) {
    if (!editor) return;

    // Only apply if the current editor matches the trace we are viewing
    if (this.currentTracePath && editor.document.uri.fsPath !== this.currentTracePath) {
      // Clear decorations if we switched away (though VS Code manages per-editor decorations usually)
      return;
    }

    const executedRanges: vscode.Range[] = [];
    const hotLoopRanges: vscode.Range[] = [];

    // Calculate a hot loop threshold (e.g. top 20% most executed or > 5 times)
    let maxExecutions = 0;
    for (const count of this.lineExecutionCounts.values()) {
      if (count > maxExecutions) maxExecutions = count;
    }
    const hotThreshold = Math.max(5, maxExecutions * 0.5);

    for (const [line, count] of this.lineExecutionCounts.entries()) {
      const range = new vscode.Range(line - 1, 0, line - 1, 0);
      if (count >= hotThreshold && maxExecutions > 1) {
        // Also add hover message with execution count
        const hoverMessage = new vscode.MarkdownString(`🔄 Executed ${count} times (Hot Loop)`);
        hotLoopRanges.push({ range, hoverMessage } as any);
      } else {
        const hoverMessage = new vscode.MarkdownString(`✅ Executed ${count} time(s)`);
        executedRanges.push({ range, hoverMessage } as any);
      }
    }

    editor.setDecorations(this.executedLineDecoration, executedRanges);
    editor.setDecorations(this.hotLoopDecoration, hotLoopRanges);
  }

  public dispose() {
    this.executedLineDecoration.dispose();
    this.hotLoopDecoration.dispose();
    this.activeLineDecoration.dispose();
  }
}
