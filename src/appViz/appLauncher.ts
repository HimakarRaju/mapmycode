import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import type { FrameworkInfo } from './frameworkDetector';

/**
 * Launches a web application with tracing middleware injected.
 */
export class AppLauncher {
  private process: cp.ChildProcess | null = null;
  private outputChannel: vscode.OutputChannel;
  private extensionPath: string;

  constructor(extensionPath: string) {
    this.extensionPath = extensionPath;
    this.outputChannel = vscode.window.createOutputChannel('MapMyCode App');
  }

  get isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  get pid(): number | undefined {
    return this.process?.pid;
  }

  /**
   * Launch the app with tracing middleware injected.
   */
  async launch(framework: FrameworkInfo, tracePort: number): Promise<void> {
    if (this.isRunning) {
      throw new Error('App is already running. Stop it first.');
    }

    this.outputChannel.show(true);
    this.outputChannel.appendLine(`[MapMyCode] Launching ${framework.name} app with tracing (port: ${tracePort})...`);

    if (framework.language === 'python') {
      await this.launchPython(framework, tracePort);
    } else {
      await this.launchNode(framework, tracePort);
    }
  }

  stop() {
    if (this.process && !this.process.killed) {
      this.outputChannel.appendLine('[MapMyCode] Stopping app...');
      // Send SIGTERM, then SIGKILL after 5s
      this.process.kill('SIGTERM');
      const pid = this.process.pid;
      setTimeout(() => {
        try {
          if (pid) process.kill(pid, 0); // test if alive
          this.process?.kill('SIGKILL');
        } catch { /* already dead */ }
      }, 5000);
      this.process = null;
    }
  }

  private async launchPython(framework: FrameworkInfo, tracePort: number) {
    // Create a wrapper script that imports the tracer and runs the app
    const wrapperCode = this.buildPythonWrapper(framework, tracePort);
    const tmpFile = path.join(os.tmpdir(), `mapmycode_launcher_${Date.now()}.py`);
    fs.writeFileSync(tmpFile, wrapperCode, 'utf-8');

    const pythonPath = this.getPythonPath();
    this.outputChannel.appendLine(`[MapMyCode] Python: ${pythonPath}`);
    this.outputChannel.appendLine(`[MapMyCode] Wrapper: ${tmpFile}`);

    this.process = cp.spawn(pythonPath, [tmpFile], {
      cwd: framework.projectRoot,
      env: {
        ...process.env,
        MAPMYCODE_TRACE_PORT: String(tracePort),
        PYTHONDONTWRITEBYTECODE: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    this.attachOutput();

    // Cleanup temp file when process exits
    this.process.on('exit', () => {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    });
  }

  private async launchNode(framework: FrameworkInfo, tracePort: number) {
    if (!framework.entryFile) {
      throw new Error('Could not find the entry file for this Express app.');
    }

    // Create a wrapper that requires the tracer then the app
    const wrapperCode = this.buildNodeWrapper(framework, tracePort);
    const tmpFile = path.join(os.tmpdir(), `mapmycode_launcher_${Date.now()}.js`);
    fs.writeFileSync(tmpFile, wrapperCode, 'utf-8');

    const nodePath = this.getNodePath();
    this.outputChannel.appendLine(`[MapMyCode] Node: ${nodePath}`);
    this.outputChannel.appendLine(`[MapMyCode] Wrapper: ${tmpFile}`);

    this.process = cp.spawn(nodePath, [tmpFile], {
      cwd: framework.projectRoot,
      env: {
        ...process.env,
        MAPMYCODE_TRACE_PORT: String(tracePort),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    this.attachOutput();

    this.process.on('exit', () => {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    });
  }

  private buildPythonWrapper(framework: FrameworkInfo, tracePort: number): string {
    const tracerDir = path.join(this.extensionPath, 'python').replace(/\\/g, '\\\\');
    const entryDir = path.dirname(framework.entryFile).replace(/\\/g, '\\\\');
    const entryModule = path.basename(framework.entryFile, '.py');

    if (framework.type === 'flask') {
      return `
import sys
sys.path.insert(0, "${tracerDir}")
sys.path.insert(0, "${entryDir}")
from flask_tracer import inject_tracer
import importlib

# Import the user's app module
mod = importlib.import_module("${entryModule}")

# Find the Flask app object
app = None
for attr_name in dir(mod):
    attr = getattr(mod, attr_name)
    if hasattr(attr, 'route') and hasattr(attr, 'before_request'):
        app = attr
        break

if app is None:
    print("[MapMyCode] Could not find Flask app instance.", file=sys.stderr)
    sys.exit(1)

inject_tracer(app, ${tracePort})
print("[MapMyCode] Flask app instrumented. Starting with tracing on port ${tracePort}...")
app.run(debug=False, use_reloader=False)
`;
    }

    if (framework.type === 'fastapi') {
      return `
import sys
sys.path.insert(0, "${tracerDir}")
sys.path.insert(0, "${entryDir}")
from fastapi_tracer import inject_tracer
import importlib

mod = importlib.import_module("${entryModule}")

app = None
for attr_name in dir(mod):
    attr = getattr(mod, attr_name)
    if hasattr(attr, 'add_middleware') and hasattr(attr, 'router'):
        app = attr
        break

if app is None:
    print("[MapMyCode] Could not find FastAPI app instance.", file=sys.stderr)
    sys.exit(1)

inject_tracer(app, ${tracePort})
print("[MapMyCode] FastAPI app instrumented. Starting with tracing on port ${tracePort}...")
import uvicorn
uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
`;
    }

    return `print("[MapMyCode] Unsupported framework for auto-launch.", file=sys.stderr)`;
  }

  private buildNodeWrapper(framework: FrameworkInfo, tracePort: number): string {
    const tracerPath = path.join(this.extensionPath, 'middleware', 'express_tracer.js').replace(/\\/g, '\\\\');
    const entryFile = framework.entryFile.replace(/\\/g, '\\\\');

    return `
// MapMyCode Express launcher wrapper
process.env.MAPMYCODE_TRACE_PORT = "${tracePort}";

const tracer = require("${tracerPath}");

// Monkey-patch express to inject tracer before any routes are defined
const originalExpress = require('express');
const patchedExpress = function() {
  const app = originalExpress.apply(this, arguments);
  tracer(app, ${tracePort});
  console.log("[MapMyCode] Express app instrumented. Tracing on port ${tracePort}.");
  return app;
};
Object.assign(patchedExpress, originalExpress);
// Replace in require cache
const expressPath = require.resolve('express');
require.cache[expressPath] = {
  id: expressPath,
  filename: expressPath,
  loaded: true,
  exports: patchedExpress,
};
Object.keys(originalExpress).forEach(k => { patchedExpress[k] = originalExpress[k]; });
patchedExpress.Router = originalExpress.Router;

// Now load the actual app
require("${entryFile}");
`;
  }

  private attachOutput() {
    if (!this.process) return;

    this.process.stdout?.on('data', (data: Buffer) => {
      this.outputChannel.append(data.toString());
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      this.outputChannel.append(data.toString());
    });

    this.process.on('exit', (code, signal) => {
      this.outputChannel.appendLine(`[MapMyCode] App exited (code: ${code}, signal: ${signal})`);
      this.process = null;
    });

    this.process.on('error', (err) => {
      this.outputChannel.appendLine(`[MapMyCode] Error: ${err.message}`);
      vscode.window.showErrorMessage(`MapMyCode: Failed to launch app — ${err.message}`);
      this.process = null;
    });
  }

  private getPythonPath(): string {
    const config = vscode.workspace.getConfiguration('mapmycode');
    return config.get<string>('pythonPath', '') || (process.platform === 'win32' ? 'python' : 'python3');
  }

  private getNodePath(): string {
    const config = vscode.workspace.getConfiguration('mapmycode');
    return config.get<string>('nodePath', '') || 'node';
  }
}
