import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import type { ExecutionTrace, SupportedLanguage } from '../instrumenter/traceSchema';
import { instrumentJS } from '../instrumenter/jsInstrumenter';
import { parseAnnotations } from '../instrumenter/annotationParser';
import { getArtifactDirectory } from '../utils/artifactDirectory';
import { resolvePythonInterpreter } from '../utils/pythonInterpreter';

const TRACE_START = '__MAPMYCODE_TRACE_START__';
const TRACE_END = '__MAPMYCODE_TRACE_END__';

export class Executor {
  private extensionPath: string;

  constructor(context: vscode.ExtensionContext) {
    this.extensionPath = context.extensionPath;
  }

  async execute(code: string, language: SupportedLanguage, sourcePath?: string): Promise<ExecutionTrace> {
    const config = vscode.workspace.getConfiguration('mapmycode');
    const timeout = config.get<number>('timeout', 10000);
    const maxSteps = config.get<number>('maxSteps', 5000);
    const workingDirectory = this.resolveExecutionDirectory(sourcePath);

    if (language === 'javascript') {
      return this.executeJS(code, timeout, maxSteps, workingDirectory);
    } else if (language === 'python') {
      return this.executePython(code, timeout, maxSteps, workingDirectory);
    }
    throw new Error(`Unsupported language: ${language}`);
  }

  private async executeJS(code: string, timeout: number, maxSteps: number, workingDirectory: string): Promise<ExecutionTrace> {
    const { instrumentedCode, annotations } = instrumentJS(code, maxSteps);

    // Write the instrumented file next to the source so require/import resolution still works.
    const tmpDir = workingDirectory;
    const tmpFile = path.join(tmpDir, `mapmycode_${Date.now()}.js`);
    fs.writeFileSync(tmpFile, instrumentedCode, 'utf-8');

    try {
      const nodePath = this.getNodePath();
      const stdout = await this.spawn(nodePath, [tmpFile], timeout, workingDirectory);
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

  private async executePython(code: string, timeout: number, maxSteps: number, workingDirectory: string): Promise<ExecutionTrace> {
    const annotations = parseAnnotations(code);
    const importRoots = this.resolvePythonImportRoots(workingDirectory);

    // Write the temporary script beside the source so local imports behave like the original file.
    const tmpDir = workingDirectory;
    const tmpFile = path.join(tmpDir, `mapmycode_${Date.now()}.py`);
    fs.writeFileSync(tmpFile, code, 'utf-8');

    const tracerPath = path.join(this.extensionPath, 'python', 'tracer.py');

    try {
      const pythonPath = await this.getPythonPath(workingDirectory);
      const stdout = await this.spawn(
        pythonPath,
        [tracerPath, tmpFile, String(maxSteps)],
        timeout,
        workingDirectory,
        { MAPMYCODE_IMPORT_ROOTS: importRoots.join(path.delimiter) },
      );
      const traceData = this.extractTrace(stdout);

      return {
        language: 'python',
        code,
        files: traceData.files,
        steps: traceData.steps,
        annotations,
        error: traceData.error ?? undefined,
        totalSteps: traceData.totalSteps,
      };
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }

  private spawn(
    command: string,
    args: string[],
    timeout: number,
    cwd: string,
    envOverrides: NodeJS.ProcessEnv = {},
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const proc = cp.spawn(command, args, {
        cwd,
        timeout,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...envOverrides },
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

    private extractTrace(stdout: string): { steps: any[]; totalSteps: number; error: string | null; files?: Record<string, string> } {
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

  private async getPythonPath(resourcePath?: string): Promise<string> {
    return resolvePythonInterpreter(resourcePath);
  }

  private resolveExecutionDirectory(sourcePath?: string): string {
    if (sourcePath) {
      const normalized = path.normalize(sourcePath);
      if (fs.existsSync(normalized)) {
        return fs.statSync(normalized).isDirectory() ? normalized : path.dirname(normalized);
      }
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceFolder && fs.existsSync(workspaceFolder)) {
      return getArtifactDirectory(workspaceFolder);
    }

    return getArtifactDirectory();
  }

  private resolvePythonImportRoots(workingDirectory: string): string[] {
    const roots = new Set<string>();
    const normalizedWorkingDirectory = path.normalize(workingDirectory);
    roots.add(normalizedWorkingDirectory);

    const workspaceFolder = vscode.workspace.workspaceFolders?.find((folder) =>
      normalizedWorkingDirectory.toLowerCase().startsWith(path.normalize(folder.uri.fsPath).toLowerCase())
    );

    if (!workspaceFolder) {
      return Array.from(roots);
    }

    const workspaceRoot = path.normalize(workspaceFolder.uri.fsPath);
    let current = normalizedWorkingDirectory;

    while (true) {
      roots.add(current);
      if (current.toLowerCase() === workspaceRoot.toLowerCase()) {
        break;
      }

      const parent = path.dirname(current);
      if (parent === current || !parent.toLowerCase().startsWith(workspaceRoot.toLowerCase())) {
        roots.add(workspaceRoot);
        break;
      }

      current = parent;
    }

    return Array.from(roots);
  }
}
