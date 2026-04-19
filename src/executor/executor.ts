import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import type { ExecutionTrace, SupportedLanguage } from '../instrumenter/traceSchema';
import { instrumentJS } from '../instrumenter/jsInstrumenter';
import { parseAnnotations } from '../instrumenter/annotationParser';

const TRACE_START = '__MAPMYCODE_TRACE_START__';
const TRACE_END = '__MAPMYCODE_TRACE_END__';

export class Executor {
  private extensionPath: string;

  constructor(context: vscode.ExtensionContext) {
    this.extensionPath = context.extensionPath;
  }

  async execute(code: string, language: SupportedLanguage): Promise<ExecutionTrace> {
    const config = vscode.workspace.getConfiguration('mapmycode');
    const timeout = config.get<number>('timeout', 10000);
    const maxSteps = config.get<number>('maxSteps', 5000);

    if (language === 'javascript') {
      return this.executeJS(code, timeout, maxSteps);
    } else if (language === 'python') {
      return this.executePython(code, timeout, maxSteps);
    }
    throw new Error(`Unsupported language: ${language}`);
  }

  private async executeJS(code: string, timeout: number, maxSteps: number): Promise<ExecutionTrace> {
    const { instrumentedCode, annotations } = instrumentJS(code, maxSteps);

    // Write instrumented code to a temp file
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `mapmycode_${Date.now()}.js`);
    fs.writeFileSync(tmpFile, instrumentedCode, 'utf-8');

    try {
      const nodePath = this.getNodePath();
      const stdout = await this.spawn(nodePath, [tmpFile], timeout);
      const traceData = this.extractTrace(stdout);

      return {
        language: 'javascript',
        code,
        steps: traceData.steps,
        annotations,
        error: traceData.error ?? undefined,
        totalSteps: traceData.totalSteps,
      };
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }

  private async executePython(code: string, timeout: number, maxSteps: number): Promise<ExecutionTrace> {
    const annotations = parseAnnotations(code);

    // Write user code to a temp file
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `mapmycode_${Date.now()}.py`);
    fs.writeFileSync(tmpFile, code, 'utf-8');

    const tracerPath = path.join(this.extensionPath, 'python', 'tracer.py');

    try {
      const pythonPath = this.getPythonPath();
      const stdout = await this.spawn(pythonPath, [tracerPath, tmpFile, String(maxSteps)], timeout);
      const traceData = this.extractTrace(stdout);

      return {
        language: 'python',
        code,
        steps: traceData.steps,
        annotations,
        error: traceData.error ?? undefined,
        totalSteps: traceData.totalSteps,
      };
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }

  private spawn(command: string, args: string[], timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const proc = cp.spawn(command, args, {
        timeout,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
        // Security: don't inherit shell
        shell: false,
      });

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
        // Safety: limit output size to 10MB
        if (stdout.length > 10 * 1024 * 1024) {
          proc.kill('SIGKILL');
          reject(new Error('Output too large — possible infinite loop.'));
        }
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (exitCode) => {
        if (stdout.includes(TRACE_START)) {
          resolve(stdout);
        } else if (stderr) {
          reject(new Error(stderr.slice(0, 2000)));
        } else if (exitCode !== 0) {
          reject(new Error(`Process exited with code ${exitCode}`));
        } else {
          reject(new Error('No trace output received. Make sure the code calls functions or has statements to execute.'));
        }
      });

      proc.on('error', (err) => {
        if ((err as any).code === 'ENOENT') {
          reject(new Error(`Runtime not found: "${command}". Check mapmycode settings.`));
        } else {
          reject(err);
        }
      });
    });
  }

  private extractTrace(stdout: string): { steps: any[]; totalSteps: number; error: string | null } {
    const startIdx = stdout.indexOf(TRACE_START);
    const endIdx = stdout.indexOf(TRACE_END);
    if (startIdx === -1 || endIdx === -1) {
      throw new Error('Failed to extract trace data from execution output.');
    }
    const jsonStr = stdout.slice(startIdx + TRACE_START.length, endIdx);
    try {
      return JSON.parse(jsonStr);
    } catch {
      throw new Error('Failed to parse trace JSON output.');
    }
  }

  private getNodePath(): string {
    const config = vscode.workspace.getConfiguration('mapmycode');
    const custom = config.get<string>('nodePath', '');
    if (custom) return custom;
    return 'node';
  }

  private getPythonPath(): string {
    const config = vscode.workspace.getConfiguration('mapmycode');
    const custom = config.get<string>('pythonPath', '');
    if (custom) return custom;
    // Try common Python paths
    if (process.platform === 'win32') return 'python';
    return 'python3';
  }
}
