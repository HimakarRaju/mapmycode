import * as fs from 'fs';
import * as path from 'path';
import { parse } from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import type { CallGraph, CallGraphEdge, CallGraphNode } from './codebaseTypes';

type PendingCallRef = PendingCallData & { callerId: string };

type PendingCallData = 
  | { mode: 'local'; name: string; className?: string }
  | { mode: 'classMethod'; className: string; name: string }
  | { mode: 'imported'; alias: string; memberName?: string };

interface JSImportBinding {
  targetFile?: string;
  importedName: string;
  namespace: boolean;
  external: boolean;
}

interface FileCallAnalysis {
  relativePath: string;
  symbols: Map<string, string>;
  freeFunctions: Map<string, string>;
  classMethods: Map<string, string>;
  importedBindings: Map<string, JSImportBinding>;
  pendingCalls: PendingCallRef[];
}

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', 'coverage', '.mapmycode']);
const CALLABLE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.py'];
const PYTHON_KEYWORDS = new Set(['if', 'for', 'while', 'with', 'return', 'class', 'def', 'elif', 'except', 'assert', 'yield', 'lambda']);

export function analyzeCallGraph(rootPath: string): CallGraph {
  const files = collectSourceFiles(rootPath);
  const nodeMap = new Map<string, CallGraphNode>();
  const analyses = new Map<string, FileCallAnalysis>();

  for (const file of files) {
    const relativePath = normalizePath(path.relative(rootPath, file));
    const analysis = createFileAnalysis(relativePath);
    analyses.set(relativePath, analysis);

    if (file.endsWith('.py')) {
      analyzePythonFile(file, rootPath, analysis, nodeMap);
      continue;
    }

    analyzeJavaScriptFile(file, rootPath, analysis, nodeMap);
  }

  const edges = new Map<string, CallGraphEdge>();
  for (const analysis of analyses.values()) {
    for (const call of analysis.pendingCalls) {
      const targetId = resolvePendingCall(call, analysis, analyses);
      if (!targetId || targetId === call.callerId) {
        continue;
      }

      const edgeKey = `${call.callerId}=>${targetId}`;
      if (!edges.has(edgeKey)) {
        edges.set(edgeKey, { caller: call.callerId, callee: targetId });
      }
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edges.values()),
  };
}

function analyzeJavaScriptFile(
  filePath: string,
  rootPath: string,
  analysis: FileCallAnalysis,
  nodeMap: Map<string, CallGraphNode>,
) {
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return;
  }

  let ast;
  try {
    ast = parse(content, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      plugins: ['jsx', 'typescript', 'classProperties', 'classPrivateProperties', 'classPrivateMethods', 'dynamicImport', 'decorators-legacy'],
    });
  } catch {
    return;
  }

  const scopeStack: Array<{ id: string; className?: string }> = [];

  traverse(ast, {
    ImportDeclaration(importPath) {
      const sourceValue = importPath.node.source.value;
      const isExternal = !sourceValue.startsWith('.') && !sourceValue.startsWith('/');
      const targetFile = isExternal ? undefined : resolveImport(sourceValue, filePath, rootPath);

      for (const specifier of importPath.node.specifiers) {
        if (t.isImportSpecifier(specifier)) {
          const importedName = t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.imported.value;
          analysis.importedBindings.set(specifier.local.name, {
            targetFile,
            importedName,
            namespace: false,
            external: isExternal,
          });
          continue;
        }

        if (t.isImportDefaultSpecifier(specifier)) {
          analysis.importedBindings.set(specifier.local.name, {
            targetFile,
            importedName: 'default',
            namespace: false,
            external: isExternal,
          });
          continue;
        }

        if (t.isImportNamespaceSpecifier(specifier)) {
          analysis.importedBindings.set(specifier.local.name, {
            targetFile,
            importedName: '*',
            namespace: true,
            external: isExternal,
          });
        }
      }
    },

    FunctionDeclaration: {
      enter(functionPath) {
        const name = functionPath.node.id?.name;
        if (!name) {
          return;
        }

        const scope = {
          id: registerSymbol(analysis, nodeMap, name, functionPath.node.loc?.start.line ?? 1),
        };
        functionPath.setData('mapmycodeScope', scope);
        scopeStack.push(scope);
      },
      exit(functionPath) {
        popScope(scopeStack, functionPath.getData('mapmycodeScope')?.id);
      },
    },

    VariableDeclarator: {
      enter(variablePath) {
        if (!t.isIdentifier(variablePath.node.id)) {
          return;
        }

        if (!isFunctionLike(variablePath.node.init)) {
          return;
        }

        const scope = {
          id: registerSymbol(analysis, nodeMap, variablePath.node.id.name, variablePath.node.loc?.start.line ?? 1),
        };
        variablePath.setData('mapmycodeScope', scope);
        scopeStack.push(scope);
      },
      exit(variablePath) {
        popScope(scopeStack, variablePath.getData('mapmycodeScope')?.id);
      },
    },

    ClassMethod: {
      enter(methodPath) {
        if (methodPath.node.computed) {
          return;
        }

        const className = getEnclosingClassName(methodPath);
        const methodName = getPropertyName(methodPath.node.key);
        if (!className || !methodName) {
          return;
        }

        const scope = {
          id: registerSymbol(analysis, nodeMap, `${className}.${methodName}`, methodPath.node.loc?.start.line ?? 1),
          className,
        };
        methodPath.setData('mapmycodeScope', scope);
        scopeStack.push(scope);
      },
      exit(methodPath) {
        popScope(scopeStack, methodPath.getData('mapmycodeScope')?.id);
      },
    },

    CallExpression(callPath) {
      const currentScope = scopeStack[scopeStack.length - 1];
      if (!currentScope) {
        return;
      }

      const callRef = getJavaScriptCallReference(callPath.node.callee, currentScope.className);
      if (!callRef) {
        return;
      }

      analysis.pendingCalls.push({
        callerId: currentScope.id,
        ...callRef,
      });
    },
  });
}

function analyzePythonFile(
  filePath: string,
  rootPath: string,
  analysis: FileCallAnalysis,
  nodeMap: Map<string, CallGraphNode>,
) {
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return;
  }

  const lines = content.split(/\r?\n/);

  type ScopeEntry = { kind: 'class' | 'function'; indent: number; name: string; id?: string; className?: string };
  const definitionStack: ScopeEntry[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex];
    const indent = getIndent(rawLine);
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    while (definitionStack.length && indent <= definitionStack[definitionStack.length - 1].indent) {
      definitionStack.pop();
    }

    const classMatch = trimmed.match(/^class\s+([A-Za-z_][\w]*)/);
    if (classMatch) {
      definitionStack.push({ kind: 'class', indent, name: classMatch[1] });
      continue;
    }

    const functionMatch = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/);
    if (!functionMatch) {
      continue;
    }

    const classScope = [...definitionStack].reverse().find((entry) => entry.kind === 'class');
    const functionName = functionMatch[1];
    const symbolName = classScope ? `${classScope.name}.${functionName}` : functionName;
    const id = registerSymbol(analysis, nodeMap, symbolName, lineIndex + 1);
    definitionStack.push({
      kind: 'function',
      indent,
      name: functionName,
      id,
      className: classScope?.name,
    });
  }

  const callStack: ScopeEntry[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex];
    const indent = getIndent(rawLine);
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    while (callStack.length && indent <= callStack[callStack.length - 1].indent) {
      callStack.pop();
    }

    const classMatch = trimmed.match(/^class\s+([A-Za-z_][\w]*)/);
    if (classMatch) {
      callStack.push({ kind: 'class', indent, name: classMatch[1] });
      continue;
    }

    const functionMatch = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/);
    if (functionMatch) {
      const classScope = [...callStack].reverse().find((entry) => entry.kind === 'class');
      const functionName = functionMatch[1];
      const id = classScope
        ? analysis.classMethods.get(`${classScope.name}.${functionName}`)
        : analysis.freeFunctions.get(functionName);

      callStack.push({
        kind: 'function',
        indent,
        name: functionName,
        id,
        className: classScope?.name,
      });
      continue;
    }

    const currentFunction = [...callStack].reverse().find((entry) => entry.kind === 'function');
    if (!currentFunction?.id) {
      continue;
    }

    const selfMethodRegex = /\bself\.([A-Za-z_][\w]*)\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = selfMethodRegex.exec(trimmed)) !== null) {
      if (currentFunction.className) {
        analysis.pendingCalls.push({
          callerId: currentFunction.id,
          mode: 'classMethod',
          className: currentFunction.className,
          name: match[1],
        });
      }
    }

    const classMethodRegex = /\b([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)\s*\(/g;
    while ((match = classMethodRegex.exec(trimmed)) !== null) {
      if (match[1] === 'self') {
        continue;
      }

      analysis.pendingCalls.push({
        callerId: currentFunction.id,
        mode: 'classMethod',
        className: match[1],
        name: match[2],
      });
    }

    const functionCallRegex = /(^|[^.\w])([A-Za-z_][\w]*)\s*\(/g;
    while ((match = functionCallRegex.exec(trimmed)) !== null) {
      const functionName = match[2];
      if (PYTHON_KEYWORDS.has(functionName)) {
        continue;
      }

      analysis.pendingCalls.push({
        callerId: currentFunction.id,
        mode: 'local',
        name: functionName,
        className: currentFunction.className,
      });
    }
  }
}

function resolvePendingCall(
  call: PendingCallRef,
  currentAnalysis: FileCallAnalysis,
  analyses: Map<string, FileCallAnalysis>,
): string | undefined {
  switch (call.mode) {
    case 'local': {
      const localTarget = currentAnalysis.freeFunctions.get(call.name)
        ?? (call.className ? currentAnalysis.classMethods.get(`${call.className}.${call.name}`) : undefined);
      if (localTarget) {
        return localTarget;
      }

      return resolveImportedReference(currentAnalysis, analyses, call.name);
    }
    case 'classMethod':
      return currentAnalysis.classMethods.get(`${call.className}.${call.name}`);
    case 'imported':
      return resolveImportedReference(currentAnalysis, analyses, call.alias, call.memberName);
    default:
      return undefined;
  }
}

function resolveImportedReference(
  currentAnalysis: FileCallAnalysis,
  analyses: Map<string, FileCallAnalysis>,
  alias: string,
  memberName?: string,
): string | undefined {
  const binding = currentAnalysis.importedBindings.get(alias);
  if (!binding || binding.external || !binding.targetFile) {
    return undefined;
  }

  const targetAnalysis = analyses.get(binding.targetFile);
  if (!targetAnalysis) {
    return undefined;
  }

  if (binding.namespace) {
    if (!memberName) {
      return undefined;
    }
    return targetAnalysis.freeFunctions.get(memberName)
      ?? targetAnalysis.classMethods.get(memberName)
      ?? findUniqueClassMethod(targetAnalysis, memberName);
  }

  if (memberName) {
    return targetAnalysis.classMethods.get(`${binding.importedName}.${memberName}`)
      ?? targetAnalysis.freeFunctions.get(memberName)
      ?? findUniqueClassMethod(targetAnalysis, memberName);
  }

  if (binding.importedName === 'default') {
    return targetAnalysis.freeFunctions.get(alias)
      ?? targetAnalysis.symbols.get(alias);
  }

  return targetAnalysis.freeFunctions.get(binding.importedName)
    ?? targetAnalysis.symbols.get(binding.importedName);
}

function registerSymbol(
  analysis: FileCallAnalysis,
  nodeMap: Map<string, CallGraphNode>,
  symbolName: string,
  line: number,
): string {
  const id = buildNodeId(analysis.relativePath, symbolName);
  if (!nodeMap.has(id)) {
    nodeMap.set(id, {
      name: symbolName,
      file: analysis.relativePath,
      line,
    });
  }

  analysis.symbols.set(symbolName, id);
  if (symbolName.includes('.')) {
    analysis.classMethods.set(symbolName, id);
  } else {
    analysis.freeFunctions.set(symbolName, id);
  }

  return id;
}

function createFileAnalysis(relativePath: string): FileCallAnalysis {
  return {
    relativePath,
    symbols: new Map<string, string>(),
    freeFunctions: new Map<string, string>(),
    classMethods: new Map<string, string>(),
    importedBindings: new Map<string, JSImportBinding>(),
    pendingCalls: [],
  };
}

function buildNodeId(relativePath: string, symbolName: string): string {
  return `${relativePath}::${symbolName}`;
}

function getEnclosingClassName(methodPath: NodePath<t.ClassMethod>): string | undefined {
  const classPath = methodPath.findParent((parentPath) => parentPath.isClassDeclaration() || parentPath.isClassExpression());
  if (!classPath) {
    return undefined;
  }

  if ('id' in classPath.node && classPath.node.id && t.isIdentifier(classPath.node.id)) {
    return classPath.node.id.name;
  }

  return undefined;
}

function getPropertyName(node: t.Expression | t.PrivateName | t.Identifier | t.StringLiteral | t.NumericLiteral): string | undefined {
  if (t.isIdentifier(node)) {
    return node.name;
  }
  if (t.isStringLiteral(node)) {
    return node.value;
  }
  if (t.isNumericLiteral(node)) {
    return String(node.value);
  }
  return undefined;
}

function getJavaScriptCallReference(
  callee: t.Expression | t.V8IntrinsicIdentifier,
  currentClassName?: string,
): PendingCallData | undefined {
  if (t.isIdentifier(callee)) {
    return { mode: 'local', name: callee.name, className: currentClassName };
  }

  if (!t.isMemberExpression(callee) || callee.computed) {
    return undefined;
  }

  const memberName = getPropertyName(callee.property);
  if (!memberName) {
    return undefined;
  }

  if (t.isThisExpression(callee.object) && currentClassName) {
    return { mode: 'classMethod', className: currentClassName, name: memberName };
  }

  if (t.isIdentifier(callee.object)) {
    return { mode: 'imported', alias: callee.object.name, memberName };
  }

  return undefined;
}

function isFunctionLike(node: t.Node | null | undefined): node is t.FunctionExpression | t.ArrowFunctionExpression {
  return Boolean(node && (t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)));
}

function popScope(scopeStack: Array<{ id: string }>, id?: string) {
  if (!id) {
    return;
  }

  if (scopeStack[scopeStack.length - 1]?.id === id) {
    scopeStack.pop();
  }
}

function findUniqueClassMethod(analysis: FileCallAnalysis, methodName: string): string | undefined {
  const matches = Array.from(analysis.classMethods.entries())
    .filter(([key]) => key.endsWith(`.${methodName}`))
    .map(([, id]) => id);

  return matches.length === 1 ? matches[0] : undefined;
}

function collectSourceFiles(rootPath: string, maxFiles = 500): string[] {
  const results: string[] = [];

  function walk(currentPath: string) {
    if (results.length >= maxFiles) {
      return;
    }

    let entries: string[] = [];
    try {
      entries = fs.readdirSync(currentPath);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry) || entry.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(currentPath, entry);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (CALLABLE_EXTENSIONS.some((extension) => entry.endsWith(extension))) {
        results.push(fullPath);
      }
    }
  }

  walk(rootPath);
  return results;
}

function resolveImport(specifier: string, fromFile: string, rootPath: string): string {
  const baseDirectory = path.dirname(fromFile);
  const resolvedBase = path.resolve(baseDirectory, specifier);
  const candidates = [
    '',
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.py',
    '/index.ts',
    '/index.tsx',
    '/index.js',
    '/index.py',
  ];

  for (const candidate of candidates) {
    const targetPath = resolvedBase + candidate;
    if (fs.existsSync(targetPath)) {
      return normalizePath(path.relative(rootPath, targetPath));
    }
  }

  return normalizePath(path.relative(rootPath, resolvedBase));
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function getIndent(line: string): number {
  const whitespace = line.match(/^\s*/)?.[0] ?? '';
  return whitespace.replace(/\t/g, '    ').length;
}