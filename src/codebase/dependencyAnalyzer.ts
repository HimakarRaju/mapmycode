import * as fs from 'fs';
import * as path from 'path';
import type { DependencyGraph, DependencyEdge } from './codebaseTypes';

/**
 * Analyzes JavaScript/TypeScript imports to build a dependency graph.
 * Uses regex-based static analysis (no AST needed for this level of detail).
 */
export function analyzeDependencies(rootPath: string): DependencyGraph {
  const nodes = new Set<string>();
  const edges: DependencyEdge[] = [];

  const files = collectFiles(rootPath, ['.js', '.jsx', '.ts', '.tsx']);

  for (const file of files) {
    const relative = path.relative(rootPath, file).replace(/\\/g, '/');
    nodes.add(relative);

    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    // ES imports
    const importRegex = /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      const target = resolveImport(match[1], file, rootPath);
      if (target) {
        nodes.add(target);
        edges.push({ from: relative, to: target, type: 'import' });
      }
    }

    // require()
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      const target = resolveImport(match[1], file, rootPath);
      if (target) {
        nodes.add(target);
        edges.push({ from: relative, to: target, type: 'require' });
      }
    }

    // Dynamic imports
    const dynRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = dynRegex.exec(content)) !== null) {
      const target = resolveImport(match[1], file, rootPath);
      if (target) {
        nodes.add(target);
        edges.push({ from: relative, to: target, type: 'dynamic' });
      }
    }
  }

  return { nodes: Array.from(nodes), edges };
}

function resolveImport(specifier: string, fromFile: string, rootPath: string): string | null {
  // Skip node_modules / bare specifiers
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    return specifier; // external package — keep as-is
  }

  const dir = path.dirname(fromFile);
  let resolved = path.resolve(dir, specifier);
  const relative = path.relative(rootPath, resolved).replace(/\\/g, '/');

  // Try common extensions
  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];
  for (const ext of extensions) {
    if (fs.existsSync(resolved + ext)) {
      return path.relative(rootPath, resolved + ext).replace(/\\/g, '/');
    }
  }

  return relative;
}

function collectFiles(dir: string, extensions: string[], maxFiles = 500): string[] {
  const results: string[] = [];
  const ignore = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', 'coverage', '.mapmycode']);

  function walk(d: string) {
    if (results.length >= maxFiles) return;
    let entries: string[];
    try { entries = fs.readdirSync(d); } catch { return; }

    for (const entry of entries) {
      if (ignore.has(entry) || entry.startsWith('.')) continue;
      const full = path.join(d, entry);
      let stat: fs.Stats;
      try { stat = fs.statSync(full); } catch { continue; }

      if (stat.isDirectory()) {
        walk(full);
      } else if (extensions.some((ext) => entry.endsWith(ext))) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}
