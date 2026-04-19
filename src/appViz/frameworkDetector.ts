import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export type FrameworkType =
  | 'flask'
  | 'fastapi'
  | 'django'
  | 'express'
  | 'nestjs'
  | 'koa'
  | 'unknown';

export interface FrameworkInfo {
  type: FrameworkType;
  name: string;
  entryFile: string;
  language: 'python' | 'javascript';
  projectRoot: string;
  configFiles: string[];
}

/**
 * Detect which web framework(s) a workspace uses by examining
 * dependency manifests and common file patterns.
 */
export async function detectFramework(workspaceRoot: string): Promise<FrameworkInfo | null> {
  // Check Python frameworks first
  const pyFramework = await detectPythonFramework(workspaceRoot);
  if (pyFramework) return pyFramework;

  // Then JS/TS frameworks
  const jsFramework = await detectJSFramework(workspaceRoot);
  if (jsFramework) return jsFramework;

  return null;
}

async function detectPythonFramework(root: string): Promise<FrameworkInfo | null> {
  // Check requirements.txt, Pipfile, pyproject.toml, setup.py
  const depFiles = ['requirements.txt', 'Pipfile', 'pyproject.toml', 'setup.py', 'setup.cfg'];
  let deps = '';

  for (const f of depFiles) {
    const fp = path.join(root, f);
    if (fs.existsSync(fp)) {
      deps += fs.readFileSync(fp, 'utf-8').toLowerCase() + '\n';
    }
  }

  // Detect FastAPI
  if (deps.includes('fastapi')) {
    const entry = findPythonEntry(root, ['main.py', 'app.py', 'app/main.py', 'src/main.py', 'api/main.py']);
    return {
      type: 'fastapi',
      name: 'FastAPI',
      entryFile: entry,
      language: 'python',
      projectRoot: root,
      configFiles: depFiles.map((f) => path.join(root, f)).filter((f) => fs.existsSync(f)),
    };
  }

  // Detect Flask
  if (deps.includes('flask')) {
    const entry = findPythonEntry(root, ['app.py', 'main.py', 'wsgi.py', 'app/__init__.py', 'src/app.py']);
    return {
      type: 'flask',
      name: 'Flask',
      entryFile: entry,
      language: 'python',
      projectRoot: root,
      configFiles: depFiles.map((f) => path.join(root, f)).filter((f) => fs.existsSync(f)),
    };
  }

  // Detect Django
  if (deps.includes('django')) {
    const managePy = path.join(root, 'manage.py');
    return {
      type: 'django',
      name: 'Django',
      entryFile: fs.existsSync(managePy) ? managePy : '',
      language: 'python',
      projectRoot: root,
      configFiles: depFiles.map((f) => path.join(root, f)).filter((f) => fs.existsSync(f)),
    };
  }

  // Fallback: scan .py files for framework imports
  const pyFiles = await findFiles(root, '*.py', 5);
  for (const pyFile of pyFiles) {
    const content = fs.readFileSync(pyFile, 'utf-8');
    if (/from\s+fastapi\s+import|import\s+fastapi/i.test(content)) {
      return { type: 'fastapi', name: 'FastAPI', entryFile: pyFile, language: 'python', projectRoot: root, configFiles: [] };
    }
    if (/from\s+flask\s+import|import\s+flask/i.test(content)) {
      return { type: 'flask', name: 'Flask', entryFile: pyFile, language: 'python', projectRoot: root, configFiles: [] };
    }
  }

  return null;
}

async function detectJSFramework(root: string): Promise<FrameworkInfo | null> {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;

  let pkg: any;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  } catch {
    return null;
  }

  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  // Detect NestJS
  if (allDeps['@nestjs/core']) {
    const entry = findJSEntry(root, ['src/main.ts', 'src/main.js', 'main.ts', 'main.js']);
    return { type: 'nestjs', name: 'NestJS', entryFile: entry, language: 'javascript', projectRoot: root, configFiles: [pkgPath] };
  }

  // Detect Express
  if (allDeps['express']) {
    const entry = findJSEntry(root, [
      'src/index.ts', 'src/index.js', 'src/app.ts', 'src/app.js',
      'src/server.ts', 'src/server.js', 'index.js', 'app.js', 'server.js',
    ]);
    return { type: 'express', name: 'Express.js', entryFile: entry, language: 'javascript', projectRoot: root, configFiles: [pkgPath] };
  }

  // Detect Koa
  if (allDeps['koa']) {
    const entry = findJSEntry(root, ['src/index.ts', 'src/index.js', 'index.js', 'app.js', 'server.js']);
    return { type: 'koa', name: 'Koa', entryFile: entry, language: 'javascript', projectRoot: root, configFiles: [pkgPath] };
  }

  return null;
}

function findPythonEntry(root: string, candidates: string[]): string {
  for (const c of candidates) {
    const full = path.join(root, c);
    if (fs.existsSync(full)) return full;
  }
  return '';
}

function findJSEntry(root: string, candidates: string[]): string {
  for (const c of candidates) {
    const full = path.join(root, c);
    if (fs.existsSync(full)) return full;
  }
  return '';
}

async function findFiles(root: string, pattern: string, maxDepth: number): Promise<string[]> {
  const results: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__' || entry.name === 'venv' || entry.name === '.venv') {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile() && matchGlob(entry.name, pattern)) {
        results.push(full);
      }
    }
  };
  walk(root, 0);
  return results;
}

function matchGlob(name: string, pattern: string): boolean {
  if (pattern.startsWith('*.')) {
    return name.endsWith(pattern.slice(1));
  }
  return name === pattern;
}
