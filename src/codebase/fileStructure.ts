import * as fs from 'fs';
import * as path from 'path';
import type { FileNode } from './codebaseTypes';

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.vscode', 'dist', 'build',
  '.next', '.nuxt', 'coverage', '.tox', 'venv', '.venv', 'env', '.mapmycode',
]);
const MAX_DEPTH = 8;

/** Build a file tree structure from a workspace directory. */
export function buildFileTree(rootPath: string, depth = 0): FileNode {
  const name = path.basename(rootPath);
  const stat = fs.statSync(rootPath);

  if (stat.isFile()) {
    return {
      name,
      path: rootPath,
      size: stat.size,
      type: 'file',
      language: getLanguage(name),
    };
  }

  if (depth >= MAX_DEPTH) {
    return { name, path: rootPath, size: 0, type: 'directory', children: [] };
  }

  let children: FileNode[] = [];
  try {
    const entries = fs.readdirSync(rootPath);
    children = entries
      .filter((e) => !IGNORE_DIRS.has(e) && !e.startsWith('.'))
      .map((e) => buildFileTree(path.join(rootPath, e), depth + 1))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  } catch { /* permission issues */ }

  const totalSize = children.reduce((s, c) => s + c.size, 0);

  return { name, path: rootPath, size: totalSize, type: 'directory', children };
}

function getLanguage(filename: string): string | undefined {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.js': 'javascript', '.jsx': 'javascript', '.ts': 'typescript', '.tsx': 'typescript',
    '.py': 'python', '.java': 'java', '.go': 'go', '.rs': 'rust',
    '.css': 'css', '.html': 'html', '.json': 'json', '.md': 'markdown',
    '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.rb': 'ruby', '.php': 'php',
  };
  return map[ext];
}
