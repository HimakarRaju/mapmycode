import type { AnnotationConfig } from './traceSchema';

/**
 * Parses annotation comments from source code.
 * Supports: @hist=var1,var2  @ignore-function-tree  @function-tree-once  @skip-function
 */
export function parseAnnotations(code: string): AnnotationConfig {
  const config: AnnotationConfig = {
    hist: [],
    ignoreFunctionTree: [],
    functionTreeOnce: [],
    skipFunction: [],
  };

  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    let comment: string | null = null;

    // Match // comment or # comment (Python)
    const jsMatch = line.match(/^\/\/\s*(@.+)/);
    const pyMatch = line.match(/^#\s*(@.+)/);
    if (jsMatch) {
      comment = jsMatch[1].trim();
    } else if (pyMatch) {
      comment = pyMatch[1].trim();
    }

    if (!comment) continue;

    // @hist=var1,var2,...
    const histMatch = comment.match(/^@hist\s*=\s*(.+)/);
    if (histMatch) {
      const vars = histMatch[1].split(',').map((v) => v.trim()).filter(Boolean);
      config.hist!.push(...vars);
      continue;
    }

    // @ignore-function-tree — next function
    if (comment === '@ignore-function-tree') {
      const fnName = findNextFunctionName(lines, i + 1);
      if (fnName) config.ignoreFunctionTree!.push(fnName);
      continue;
    }

    // @function-tree-once — next function
    if (comment === '@function-tree-once') {
      const fnName = findNextFunctionName(lines, i + 1);
      if (fnName) config.functionTreeOnce!.push(fnName);
      continue;
    }

    // @skip-function — next function
    if (comment === '@skip-function') {
      const fnName = findNextFunctionName(lines, i + 1);
      if (fnName) config.skipFunction!.push(fnName);
      continue;
    }
  }

  return config;
}

/**
 * Finds the name of the next function definition starting from lineIndex.
 */
function findNextFunctionName(lines: string[], startIndex: number): string | null {
  for (let i = startIndex; i < Math.min(startIndex + 5, lines.length); i++) {
    const line = lines[i].trim();

    // JS: function name(...)
    const jsFn = line.match(/^(?:async\s+)?function\s+(\w+)/);
    if (jsFn) return jsFn[1];

    // JS: const/let/var name = function/arrow
    const jsVar = line.match(/^(?:const|let|var)\s+(\w+)\s*=/);
    if (jsVar) return jsVar[1];

    // Python: def name(...)
    const pyDef = line.match(/^(?:async\s+)?def\s+(\w+)/);
    if (pyDef) return pyDef[1];

    // Skip blank lines and comments
    if (line === '' || line.startsWith('//') || line.startsWith('#')) continue;

    break;
  }
  return null;
}
