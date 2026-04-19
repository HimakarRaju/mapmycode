import * as vscode from 'vscode';

/**
 * Syncs VS Code breakpoints with the visualization playback.
 * When "play" hits a breakpoint line, it will pause.
 */
export class BreakpointSync implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private breakpointLines = new Set<number>();
  private sourceUri: vscode.Uri | undefined;

  constructor() {
    this.disposables.push(
      vscode.debug.onDidChangeBreakpoints(() => this.refresh()),
    );
    this.refresh();
  }

  /** Call when a new file is being visualized */
  setSource(uri: vscode.Uri) {
    this.sourceUri = uri;
    this.refresh();
  }

  /** Returns set of 1-based line numbers that have breakpoints */
  getBreakpointLines(): Set<number> {
    return this.breakpointLines;
  }

  /** Check if playback should pause at this line */
  shouldPause(line: number): boolean {
    return this.breakpointLines.has(line);
  }

  private refresh() {
    this.breakpointLines.clear();
    for (const bp of vscode.debug.breakpoints) {
      if (bp instanceof vscode.SourceBreakpoint && bp.enabled) {
        if (!this.sourceUri || bp.location.uri.toString() === this.sourceUri.toString()) {
          this.breakpointLines.add(bp.location.range.start.line + 1); // 0-indexed → 1-indexed
        }
      }
    }
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
  }
}
