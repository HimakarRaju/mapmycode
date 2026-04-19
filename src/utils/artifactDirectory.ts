import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

const ARTIFACT_DIR_NAME = '.mapmycode';

export function getArtifactDirectory(preferredRoot?: string): string {
  const baseRoot = resolveBaseRoot(preferredRoot);
  const artifactDirectory = path.join(baseRoot, ARTIFACT_DIR_NAME);
  fs.mkdirSync(artifactDirectory, { recursive: true });
  return artifactDirectory;
}

function resolveBaseRoot(preferredRoot?: string): string {
  if (preferredRoot && fs.existsSync(preferredRoot)) {
    return preferredRoot;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot && fs.existsSync(workspaceRoot)) {
    return workspaceRoot;
  }

  return os.tmpdir();
}
