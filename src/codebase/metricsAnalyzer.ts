import * as fs from 'fs';
import * as path from 'path';
import type { CodeMetrics } from './codebaseTypes';

/**
 * Calculates code metrics for the workspace: file counts, line counts, language distribution.
 */
export function analyzeCodeMetrics(rootPath: string): CodeMetrics {
  const languages: Record<string, { files: number; lines: number }> = {};
  let totalFiles = 0;
  let totalLines = 0;
  const fileSizes: { file: string; lines: number }[] = [];

  const files = collectAllFiles(rootPath);

  for (const file of files) {
    let content: string;
    try { content = fs.readFileSync(file, 'utf-8'); } catch { continue; }

    const lineCount = content.split('\n').length;
    totalFiles++;
    totalLines += lineCount;

    const lang = getLanguageFromExt(path.extname(file).toLowerCase());
    if (!languages[lang]) languages[lang] = { files: 0, lines: 0 };
    languages[lang].files++;
    languages[lang].lines += lineCount;

    const relative = path.relative(rootPath, file).replace(/\\/g, '/');
    fileSizes.push({ file: relative, lines: lineCount });
  }

  // Top 10 largest files
  fileSizes.sort((a, b) => b.lines - a.lines);
  const largest = fileSizes.slice(0, 10);

  return { files: totalFiles, totalLines, languages, largest };
}

function getLanguageFromExt(ext: string): string {
  const map: Record<string, string> = {
    '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript',
    '.ts': 'TypeScript', '.tsx': 'TypeScript',
    '.py': 'Python', '.java': 'Java', '.go': 'Go', '.rs': 'Rust',
    '.css': 'CSS', '.scss': 'SCSS', '.less': 'LESS',
    '.html': 'HTML', '.htm': 'HTML', '.vue': 'Vue',
    '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML',
    '.md': 'Markdown', '.txt': 'Text',
    '.c': 'C', '.cpp': 'C++', '.h': 'C/C++ Header',
    '.rb': 'Ruby', '.php': 'PHP', '.swift': 'Swift', '.kt': 'Kotlin',
    '.sh': 'Shell', '.bash': 'Shell', '.ps1': 'PowerShell',
  };
  return map[ext] || 'Other';
}

function collectAllFiles(dir: string, maxFiles = 1000): string[] {
  const results: string[] = [];
  const ignore = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', 'coverage', '.next', 'venv', '.venv']);

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
      else if (!entry.endsWith('.lock') && !entry.endsWith('.map')) results.push(full);
    }
  }
  walk(dir);
  return results;
}
