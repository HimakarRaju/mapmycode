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

  /**
   * Exports a Markdown report with automatically generated Mermaid.js flowcharts of the execution.
   */
  async exportMarkdownReport(trace: ExecutionTrace, stepIndex?: number): Promise<void> {
    const markdown = buildMarkdownReport(trace, stepIndex);
    const uri = await vscode.window.showSaveDialog({
      filters: { 'Markdown Files': ['md'] },
      defaultUri: vscode.Uri.file('MapMyCode_Trace_Report.md'),
    });
    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(markdown, 'utf-8'));
      vscode.window.showInformationMessage(`MapMyCode: Markdown Report exported to ${uri.fsPath}`);
    }
  }
}

function buildMarkdownReport(trace: ExecutionTrace, stepIndex?: number): string {
  const steps = stepIndex !== undefined ? trace.steps.slice(0, stepIndex + 1) : trace.steps;
  const isPartial = stepIndex !== undefined && stepIndex < trace.steps.length - 1;
  const totalStepsStr = isPartial ? `${steps.length} (Partial trace at step ${stepIndex + 1} of ${trace.totalSteps})` : `${trace.totalSteps}`;

  let md = `# Execution Trace Report\n\n`;
  md += `**Language:** ${trace.language}\n`;
  md += `**Total Steps Executed:** ${totalStepsStr}\n`;
  md += `**Peak Recursion/Depth:** ${calculateCallDepth(steps)}\n\n`;

  md += `## Execution Flowchart\n`;
  md += `The following Mermaid graph automatically maps the functions that successfully executed during this trace.\n\n`;
  md += `\`\`\`mermaid\n`;
  md += `graph TD;\n`;
  
  const edges = extractCallGraphEdges(steps);
  if (edges.size > 0) {
    let edgeLines = Array.from(edges).join('\n');
    md += edgeLines + '\n';
  } else {
    md += `  Main["Script Execution"]\n`;
  }
  md += `\`\`\`\n\n`;

  md += `## End-State Data Structures\n`;
  md += `Data structures left in memory directly before the process terminated:\n\n`;
  
  if (steps.length > 0) {
    const lastStep = steps[steps.length - 1];
    if (lastStep.variables.length > 0) {
      md += `| Variable | Type Class | Data Structure |\n`;
      md += `| :--- | :--- | :--- |\n`;
      for (const v of lastStep.variables) {
        md += `| \`${v.name}\` | \`${v.type}\` | **${v.dsType}** |\n`;
      }
    } else {
      md += `*No global variables remained in scope at termination.*\n`;
    }
  }

  return md;
}

function calculateCallDepth(steps: ExecutionTrace['steps']): number {
  let current = 0;
  let max = 0;
  for (const step of steps) {
    if (step.event === 'call') current++;
    else if (step.event === 'return') current--;
    if (current > max) max = current;
  }
  return max;
}

function extractCallGraphEdges(steps: ExecutionTrace['steps']): Set<string> {
  const edges = new Set<string>();
  const stack: string[] = ['<module>'];
  
  let idCounter = 1;
  const nameToId = new Map<string, string>();
  nameToId.set('<module>', 'N0');

  for (const step of steps) {
    if (step.event === 'call' && step.functionName) {
      const caller = stack[stack.length - 1];
      const callee = step.functionName;
      
      let callerId = nameToId.get(caller);
      if (!callerId) {
        callerId = `N${idCounter++}`;
        nameToId.set(caller, callerId);
      }
      
      let calleeId = nameToId.get(callee);
      if (!calleeId) {
        calleeId = `N${idCounter++}`;
        nameToId.set(callee, calleeId);
      }

      edges.add(`  ${callerId}["${caller}"] --> ${calleeId}["${callee}"]`);
      stack.push(callee);
    } else if (step.event === 'return' && stack.length > 1) {
      stack.pop();
    }
  }
  
  return edges;
}

function buildStandaloneHTML(trace: ExecutionTrace): string {
  const config = vscode.workspace.getConfiguration('mapmycode.htmlExport');
  const theme = config.get<string>('theme') || 'dark';
  const customCSS = config.get<string>('customCSS') || '';
  const layoutDir = config.get<string>('layoutDirection') || 'row';

  const traceJSON = JSON.stringify(trace);
  
  const bgMain = theme === 'light' ? '#ffffff' : '#1e1e1e';
  const bgPanel = theme === 'light' ? '#f3f3f3' : '#252526';
  const fgMain = theme === 'light' ? '#333333' : '#d4d4d4';
  const borderCol = theme === 'light' ? '#dddddd' : '#3c3c3c';
  const activeLineBg = theme === 'light' ? 'rgba(0,120,215,0.15)' : 'rgba(0,120,215,0.3)';
  const flexLayout = layoutDir === 'column' ? 'flex-direction: column;' : 'flex-direction: row;';
  const paneSize = layoutDir === 'column' ? 'height: 48%; width: 100%;' : 'width: 50%; height: 100%;';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>MapMyCode Visualization Export</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: ${bgMain}; color: ${fgMain}; height: 100vh; overflow: hidden; display: flex; flex-direction: column; }
    .container { display: flex; flex-direction: column; height: 100vh; width: 100vw; padding: 16px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding: 12px 16px; background: ${bgPanel}; border-radius: 6px; flex-shrink: 0; border: 1px solid ${borderCol}; }
    .title { font-size: 16px; font-weight: 700; }
    .step-info { font-size: 13px; opacity: 0.8; font-weight: 600; }
    .main { display: flex; flex: 1; gap: 16px; min-height: 0; align-items: stretch; ${flexLayout} }
    .code-wrapper { ${paneSize} display: flex; flex-direction: column; background: ${bgMain}; border: 1px solid ${borderCol}; border-radius: 6px; overflow: hidden; }
    .viz-pane { ${paneSize} background: ${bgPanel}; border: 1px solid ${borderCol}; border-radius: 6px; padding: 16px; overflow: auto; }
    .file-tabs { display: flex; background: ${bgPanel}; border-bottom: 1px solid ${borderCol}; overflow-x: auto; white-space: nowrap; flex-shrink: 0; }
    .file-tab { padding: 8px 16px; font-size: 12px; cursor: default; opacity: 0.6; border-right: 1px solid ${borderCol}; }
    .file-tab.active-tab { opacity: 1; font-weight: 600; background: ${bgMain}; border-bottom: 2px solid #0e639c; }
    .code-pane { flex: 1; overflow: auto; }
    table { border-collapse: collapse; width: 100%; font-family: 'Cascadia Code', 'Consolas', monospace; font-size: 13px; }
    tr.active { background: ${activeLineBg}; }
    td.ln { text-align: right; padding: 0 12px 0 8px; color: #858585; user-select: none; width: 1px; white-space: nowrap; }
    td.code { padding: 0 8px; white-space: pre; }
    .controls { display: flex; align-items: center; gap: 12px; margin-top: 12px; padding: 12px 16px; background: ${bgPanel}; border-radius: 6px; flex-shrink: 0; border: 1px solid ${borderCol}; }
    button { padding: 6px 14px; border: 1px solid #555; background: #0e639c; color: #fff; border-radius: 4px; cursor: pointer; font-size: 13px; min-width: 40px; }
    button:hover { background: #1177bb; }
    .slider { flex: 1; }
    .var-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .var-table th { text-align: left; padding: 4px 8px; border-bottom: 1px solid ${borderCol}; opacity: 0.6; }
    .var-table td { padding: 4px 8px; border-bottom: 1px solid transparent; font-family: monospace; }
    ${customCSS}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="title">MapMyCode Export</span>
      <span class="step-info" id="stepInfo">Step 1 / ${trace.totalSteps}</span>
    </div>
    <div class="main">
      <div class="code-wrapper">
        <div class="file-tabs" id="fileTabs"></div>
        <div class="code-pane" id="codePane"></div>
      </div>
      <div class="viz-pane" id="vizPane"></div>
    </div>
    <div class="controls">
      <button onclick="reset()" title="Reset">⏮</button>
      <button onclick="stepBack()" title="Step Back">◀</button>
      <button onclick="togglePlay()" id="playBtn" title="Play/Pause">▶</button>
      <button onclick="stepFwd()" title="Step Forward">▶</button>
      <button onclick="jumpEnd()" title="End">⏭</button>
      <input type="range" class="slider" id="slider" min="0" max="${trace.totalSteps - 1}" value="0" oninput="goToStep(+this.value)" />
    </div>
  </div>
  <script>
    var trace = ${traceJSON};
    var currentStep = 0;
    var playing = false;
    var timer = null;

    function render() {
      if (trace.steps.length === 0) return;
      var step = trace.steps[currentStep];
      document.getElementById('stepInfo').textContent = 'Step ' + (currentStep + 1) + ' / ' + trace.totalSteps;
      document.getElementById('slider').value = currentStep;

      // file logic
      var files = trace.files || { 'main': trace.code };
      var currentFile = (step && step.file) ? step.file : Object.keys(files)[0];
      var sourceCode = files[currentFile] || trace.code;
      
      // Render file tabs
      var knownFiles = Object.keys(files);
      var tabsHtml = '';
      for (var f = 0; f < knownFiles.length; f++) {
        var fn = knownFiles[f];
        var isSel = (fn === currentFile) ? ' active-tab' : '';
        tabsHtml += '<span class="file-tab' + isSel + '">' + escapeHtml(fn) + '</span>';
      }
      document.getElementById('fileTabs').innerHTML = tabsHtml;

      // Render code
      var lines = sourceCode.split('\\n');
      var html = '<table>';
      for (var i = 0; i < lines.length; i++) {
        var active = (step && step.line === i + 1) ? ' class="active"' : '';
        var rowId = (step && step.line === i + 1) ? ' id="activeLine"' : '';
        html += '<tr' + active + rowId + '><td class="ln">' + (i+1) + '</td><td class="code">' + escapeHtml(lines[i] || ' ') + '</td></tr>';
      }
      html += '</table>';
      document.getElementById('codePane').innerHTML = html;
      
      // Auto-scroll
      var activeEl = document.getElementById('activeLine');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // Render variables
      if (step && step.variables && step.variables.length > 0) {
        var vhtml = '<table class="var-table"><tr><th>Name</th><th>Value</th><th>Type</th></tr>';
        for (var j = 0; j < step.variables.length; j++) {
          var v = step.variables[j];
          var valStr = typeof v.value === 'string' ? v.value : JSON.stringify(v.value);
          vhtml += '<tr><td>' + escapeHtml(v.name) + '</td><td>' + escapeHtml(valStr) + '</td><td>' + escapeHtml(v.dsType) + '</td></tr>';
        }
        vhtml += '</table>';
        document.getElementById('vizPane').innerHTML = vhtml;
      } else {
        document.getElementById('vizPane').innerHTML = '<p style="opacity:0.6; font-size:13px;">No variables in scope at this step.</p>';
      }
    }

    function escapeHtml(s) {
      if (!s) return '';
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function goToStep(n) { currentStep = Math.max(0, Math.min(n, trace.totalSteps - 1)); render(); }
    function stepFwd() { goToStep(currentStep + 1); }
    function stepBack() { goToStep(currentStep - 1); }
    function reset() { goToStep(0); }
    function jumpEnd() { goToStep(trace.totalSteps - 1); }
    function togglePlay() {
      playing = !playing;
      document.getElementById('playBtn').textContent = playing ? '⏸' : '▶';
      if (playing) { 
        timer = setInterval(function() { 
          if (currentStep >= trace.totalSteps - 1) { 
            playing = false; 
            clearInterval(timer); 
            document.getElementById('playBtn').textContent = '▶'; 
            return; 
          } 
          stepFwd(); 
        }, 500); 
      }
      else { clearInterval(timer); }
    }

    // initial call
    render();
  </script>
</body>
</html>`;
}
