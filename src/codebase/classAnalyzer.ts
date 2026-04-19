import * as fs from 'fs';
import * as path from 'path';
import type { ClassInfo } from './codebaseTypes';

/**
 * Extracts class information from JS/TS files using regex patterns.
 */
export function analyzeClasses(rootPath: string): ClassInfo[] {
  const classes: ClassInfo[] = [];
  const files = collectSourceFiles(rootPath);

  for (const file of files) {
    let content: string;
    try { content = fs.readFileSync(file, 'utf-8'); } catch { continue; }

    const relative = path.relative(rootPath, file).replace(/\\/g, '/');

    // Match class declarations
    const classRegex = /^(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/gm;
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      const name = match[1];
      const extendsName = match[2] || undefined;
      const implementsList = match[3]?.split(',').map((s) => s.trim()).filter(Boolean) || undefined;
      const line = content.substring(0, match.index).split('\n').length;

      // Find methods and properties inside class body
      const { methods, properties } = extractMembers(content, match.index);

      classes.push({
        name,
        file: relative,
        line,
        methods,
        properties,
        extends: extendsName,
        implements: implementsList,
      });
    }
  }

  return classes;
}

function extractMembers(content: string, classStart: number): { methods: string[]; properties: string[] } {
  const methods: string[] = [];
  const properties: string[] = [];

  // Find the opening brace
  let braceIdx = content.indexOf('{', classStart);
  if (braceIdx < 0) return { methods, properties };

  // Find matching closing brace
  let depth = 1;
  let pos = braceIdx + 1;
  const bodyStart = pos;
  while (pos < content.length && depth > 0) {
    if (content[pos] === '{') depth++;
    if (content[pos] === '}') depth--;
    pos++;
  }
  const body = content.substring(bodyStart, pos - 1);

  // Methods: name(...) or async name(...)
  const methodRegex = /^\s+(?:async\s+)?(?:static\s+)?(?:get\s+|set\s+)?(\w+)\s*\(/gm;
  let m;
  while ((m = methodRegex.exec(body)) !== null) {
    if (!['constructor', 'if', 'for', 'while', 'switch', 'catch'].includes(m[1])) {
      methods.push(m[1]);
    }
  }

  // Properties: name = or name: or name;
  const propRegex = /^\s+(?:readonly\s+)?(?:static\s+)?(?:public|private|protected)?\s*(\w+)\s*[:=;]/gm;
  while ((m = propRegex.exec(body)) !== null) {
    if (!methods.includes(m[1])) {
      properties.push(m[1]);
    }
  }

  return { methods: [...new Set(methods)], properties: [...new Set(properties)] };
}

function collectSourceFiles(dir: string, maxFiles = 300): string[] {
  const results: string[] = [];
  const ignore = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', '.mapmycode']);
  const extensions = ['.ts', '.tsx', '.js', '.jsx'];

  function walk(d: string) {
    if (results.length >= maxFiles) return;
    let entries: string[];
    try { entries = fs.readdirSync(d); } catch { return; }
    for (const entry of entries) {
      if (ignore.has(entry) || entry.startsWith('.')) continue;
      const full = path.join(d, entry);
      let stat: fs.Stats;
      try { stat = fs.statSync(full); } catch { continue; }
      if (stat.isDirectory()) walk(full);
      else if (extensions.some((ext) => entry.endsWith(ext))) results.push(full);
    }
  }
  walk(dir);
  return results;
}
