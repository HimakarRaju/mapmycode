import * as vscode from 'vscode';

/**
 * Provides "▶ Visualize" Code Lens above functions in JS/TS/Python files.
 */
export class MapMyCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChange.event;

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const lang = document.languageId;

    if (!['javascript', 'typescript', 'python'].includes(lang)) return lenses;

    const text = document.getText();
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isFunctionLine(line, lang)) {
        const range = new vscode.Range(i, 0, i, line.length);
        lenses.push(new vscode.CodeLens(range, {
          title: '▶ Visualize',
          command: 'mapmycode.visualize',
          tooltip: 'Run and visualize this code with MapMyCode',
        }));
      }
    }

    return lenses;
  }
}

function isFunctionLine(line: string, lang: string): boolean {
  const trimmed = line.trim();

  if (lang === 'python') {
    return /^def\s+\w+\s*\(/.test(trimmed);
  }

  // JS/TS
  return (
    /^(export\s+)?(async\s+)?function\s+\w+/.test(trimmed) ||
    /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/.test(trimmed) ||
    /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?function/.test(trimmed)
  );
}
