import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export async function resolvePythonInterpreter(resourcePath?: string, preferredRoot?: string): Promise<string> {
  const resourceUri = getResourceUri(resourcePath, preferredRoot);
  const mapMyCodeConfig = vscode.workspace.getConfiguration('mapmycode', resourceUri);
  const custom = mapMyCodeConfig.get<string>('pythonPath', '');
  if (custom) {
    return resolveConfiguredPath(custom, resourceUri) ?? custom;
  }

  const pythonExtensionPath = await getPythonExtensionInterpreter(resourceUri);
  if (pythonExtensionPath) {
    return pythonExtensionPath;
  }

  const pythonConfig = vscode.workspace.getConfiguration('python', resourceUri);
  const configured = pythonConfig.get<string>('defaultInterpreterPath', '') || pythonConfig.get<string>('pythonPath', '');
  if (configured) {
    const resolvedConfigured = resolveConfiguredPath(configured, resourceUri);
    if (resolvedConfigured) {
      return resolvedConfigured;
    }
    return configured;
  }

  for (const candidate of getWorkspaceVenvCandidates(resourcePath, preferredRoot)) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return process.platform === 'win32' ? 'python' : 'python3';
}

function getResourceUri(resourcePath?: string, preferredRoot?: string): vscode.Uri | undefined {
  if (resourcePath) {
    return vscode.Uri.file(resourcePath);
  }

  if (preferredRoot) {
    return vscode.Uri.file(preferredRoot);
  }

  return vscode.window.activeTextEditor?.document.uri;
}

async function getPythonExtensionInterpreter(resourceUri?: vscode.Uri): Promise<string | undefined> {
  const pythonExtension = vscode.extensions.getExtension('ms-python.python');
  if (!pythonExtension) {
    return undefined;
  }

  try {
    const api: any = await pythonExtension.activate();
    const executionDetails = api?.settings?.getExecutionDetails?.(resourceUri);
    const execCommand = executionDetails?.execCommand;
    if (Array.isArray(execCommand) && execCommand.length > 0 && typeof execCommand[0] === 'string') {
      return execCommand[0];
    }

    const activeEnvironment = await api?.environments?.getActiveEnvironmentPath?.(resourceUri);
    if (typeof activeEnvironment === 'string' && activeEnvironment) {
      return activeEnvironment;
    }
    if (activeEnvironment && typeof activeEnvironment.path === 'string' && activeEnvironment.path) {
      return activeEnvironment.path;
    }
  } catch {
    // Fall back to settings and common venv locations.
  }

  return undefined;
}

function resolveConfiguredPath(configuredPath: string, resourceUri?: vscode.Uri): string | undefined {
  if (!configuredPath || configuredPath === 'python' || configuredPath === 'python3') {
    return undefined;
  }

  const workspaceFolder = resourceUri ? vscode.workspace.getWorkspaceFolder(resourceUri)?.uri.fsPath : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const expanded = workspaceFolder ? configuredPath.replace('${workspaceFolder}', workspaceFolder) : configuredPath;

  if (path.isAbsolute(expanded)) {
    return expanded;
  }

  if (workspaceFolder) {
    return path.resolve(workspaceFolder, expanded);
  }

  return undefined;
}

function getWorkspaceVenvCandidates(resourcePath?: string, preferredRoot?: string): string[] {
  const roots = new Set<string>();
  if (resourcePath) {
    const statPath = fs.existsSync(resourcePath) && fs.statSync(resourcePath).isDirectory() ? resourcePath : path.dirname(resourcePath);
    roots.add(statPath);
  }

  if (preferredRoot) {
    roots.add(preferredRoot);
  }

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    roots.add(folder.uri.fsPath);
  }

  const candidates: string[] = [];
  for (const root of roots) {
    candidates.push(
      path.join(root, '.venv', 'Scripts', 'python.exe'),
      path.join(root, 'venv', 'Scripts', 'python.exe'),
      path.join(root, '.venv', 'bin', 'python'),
      path.join(root, 'venv', 'bin', 'python'),
    );
  }

  return candidates;
}
