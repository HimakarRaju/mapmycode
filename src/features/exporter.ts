import * as vscode from 'vscode';
import type { ExecutionTrace } from '../instrumenter/traceSchema';

/**
 * Exports visualizations as PNG screenshot or standalone HTML.
 */
export class Exporter {
  /**
   * Exports the current trace as a standalone HTML file.
   */
  async exportHTML(trace: ExecutionTrace): Promise<void> {
    const html = buildStandaloneHTML(trace);
    const uri = await vscode.window.showSaveDialog({
      filters: { 'HTML Files': ['html'] },
      defaultUri: vscode.Uri.file('mapmycode-export.html'),
    });
    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(html, 'utf-8'));
      vscode.window.showInformationMessage(`MapMyCode: Exported to ${uri.fsPath}`);
    }
  }

  /**
   * Exports trace data as JSON for later import/sharing.
   */
  async exportJSON(trace: ExecutionTrace): Promise<void> {
    const json = JSON.stringify(trace, null, 2);
    const uri = await vscode.window.showSaveDialog({
      filters: { 'JSON Files': ['json'] },
      defaultUri: vscode.Uri.file('mapmycode-trace.json'),
    });
    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf-8'));
      vscode.window.showInformationMessage(`MapMyCode: Trace exported to ${uri.fsPath}`);
    }
  }
}

function buildStandaloneHTML(trace: ExecutionTrace): string {
  const traceJSON = JSON.stringify(trace);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>MapMyCode Visualization Export</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; color: #d4d4d4; }
    .container { max-width: 1000px; margin: 0 auto; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding: 12px 16px; background: #252526; border-radius: 6px; }
    .title { font-size: 16px; font-weight: 700; }
    .step-info { font-size: 13px; opacity: 0.7; }
    .main { display: flex; gap: 16px; }
    .code-pane { width: 40%; background: #1e1e1e; border: 1px solid #3c3c3c; border-radius: 6px; overflow: auto; max-height: 600px; }
    .viz-pane { flex: 1; background: #252526; border: 1px solid #3c3c3c; border-radius: 6px; padding: 16px; overflow: auto; max-height: 600px; }
    table { border-collapse: collapse; width: 100%; font-family: 'Cascadia Code', 'Consolas', monospace; font-size: 13px; }
    tr.active { background: rgba(0,120,215,0.3); }
    td.ln { text-align: right; padding: 0 12px 0 8px; color: #858585; user-select: none; width: 1px; white-space: nowrap; }
    td.code { padding: 0 8px; white-space: pre; }
    .controls { display: flex; align-items: center; gap: 12px; margin-top: 16px; padding: 12px 16px; background: #252526; border-radius: 6px; }
    button { padding: 6px 14px; border: 1px solid #555; background: #0e639c; color: #fff; border-radius: 4px; cursor: pointer; font-size: 13px; }
    button:hover { background: #1177bb; }
    .slider { flex: 1; }
    .var-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .var-table th { text-align: left; padding: 4px 8px; border-bottom: 1px solid #3c3c3c; opacity: 0.6; }
    .var-table td { padding: 4px 8px; border-bottom: 1px solid #2a2a2a; font-family: monospace; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="title">MapMyCode Export</span>
      <span class="step-info" id="stepInfo">Step 1 / ${trace.totalSteps}</span>
    </div>
    <div class="main">
      <div class="code-pane" id="codePane"></div>
      <div class="viz-pane" id="vizPane"></div>
    </div>
    <div class="controls">
      <button onclick="reset()">⏮</button>
      <button onclick="stepBack()">◀</button>
      <button onclick="togglePlay()" id="playBtn">▶</button>
      <button onclick="stepFwd()">▶</button>
      <button onclick="jumpEnd()">⏭</button>
      <input type="range" class="slider" id="slider" min="0" max="${trace.totalSteps - 1}" value="0" oninput="goToStep(+this.value)" />
    </div>
  </div>
  <script>
    var trace = ${traceJSON};
    var currentStep = 0;
    var playing = false;
    var timer = null;

    function render() {
      var step = trace.steps[currentStep];
      document.getElementById('stepInfo').textContent = 'Step ' + (currentStep + 1) + ' / ' + trace.totalSteps;
      document.getElementById('slider').value = currentStep;

      // Render code
      var lines = trace.code.split('\\n');
      var html = '<table>';
      for (var i = 0; i < lines.length; i++) {
        var active = step && step.line === i + 1 ? ' class="active"' : '';
        html += '<tr' + active + '><td class="ln">' + (i+1) + '</td><td class="code">' + escapeHtml(lines[i] || ' ') + '</td></tr>';
      }
      html += '</table>';
      document.getElementById('codePane').innerHTML = html;

      // Render variables
      if (step && step.variables.length > 0) {
        var vhtml = '<table class="var-table"><tr><th>Name</th><th>Value</th><th>Type</th></tr>';
        for (var j = 0; j < step.variables.length; j++) {
          var v = step.variables[j];
          vhtml += '<tr><td>' + v.name + '</td><td>' + escapeHtml(JSON.stringify(v.value)) + '</td><td>' + v.dsType + '</td></tr>';
        }
        vhtml += '</table>';
        document.getElementById('vizPane').innerHTML = vhtml;
      }
    }

    function escapeHtml(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function goToStep(n) { currentStep = Math.max(0, Math.min(n, trace.totalSteps - 1)); render(); }
    function stepFwd() { goToStep(currentStep + 1); }
    function stepBack() { goToStep(currentStep - 1); }
    function reset() { goToStep(0); }
    function jumpEnd() { goToStep(trace.totalSteps - 1); }
    function togglePlay() {
      playing = !playing;
      document.getElementById('playBtn').textContent = playing ? '⏸' : '▶';
      if (playing) { timer = setInterval(function() { if (currentStep >= trace.totalSteps - 1) { playing = false; clearInterval(timer); document.getElementById('playBtn').textContent = '▶'; return; } stepFwd(); }, 500); }
      else { clearInterval(timer); }
    }

    render();
  </script>
</body>
</html>`;
}
