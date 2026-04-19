import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import type { AnnotationConfig } from './traceSchema';
import { parseAnnotations } from './annotationParser';

/**
 * Instruments JavaScript code by inserting __trace() calls after every statement.
 * Returns { instrumentedCode, annotations }.
 */
export function instrumentJS(
  code: string,
  maxSteps: number,
): { instrumentedCode: string; annotations: AnnotationConfig } {
  const annotations = parseAnnotations(code);

  const ast = parse(code, {
    sourceType: 'script',
    plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
    allowReturnOutsideFunction: true,
  });

  // Collect all user-defined function names
  const userFunctions = new Set<string>();
  traverse(ast, {
    FunctionDeclaration(path) {
      if (path.node.id) userFunctions.add(path.node.id.name);
    },
    VariableDeclarator(path) {
      if (
        t.isIdentifier(path.node.id) &&
        (t.isFunctionExpression(path.node.init) || t.isArrowFunctionExpression(path.node.init))
      ) {
        userFunctions.add(path.node.id.name);
      }
    },
  });

  // Build the runtime preamble
  const preamble = buildPreamble(maxSteps, annotations);

  // Insert __trace() calls
  traverse(ast, {
    // After each expression statement
    ExpressionStatement(path) {
      if (isTraceCall(path.node)) return;
      const line = path.node.loc?.start.line ?? 0;
      path.insertAfter(buildTraceCall(line, 'line'));
    },

    // Variable declarations
    VariableDeclaration(path) {
      if (path.parentPath.isForStatement() || path.parentPath.isForInStatement() || path.parentPath.isForOfStatement()) return;
      const line = path.node.loc?.start.line ?? 0;
      path.insertAfter(buildTraceCall(line, 'line'));
    },

    // Return statements — wrap to capture value
    ReturnStatement(path) {
      const line = path.node.loc?.start.line ?? 0;
      if (path.node.argument) {
        const tmpVar = path.scope.generateUidIdentifier('ret');
        const decl = t.variableDeclaration('const', [
          t.variableDeclarator(tmpVar, path.node.argument),
        ]);
        const traceCall = t.expressionStatement(
          t.callExpression(t.identifier('__trace'), [
            t.numericLiteral(line),
            t.stringLiteral('return'),
            t.identifier('__captureVars'),
            t.callExpression(t.identifier('__captureVars'), []),
            tmpVar,
          ]),
        );
        const newReturn = t.returnStatement(tmpVar);
        path.replaceWithMultiple([decl, traceCall, newReturn]);
        path.skip();
      }
    },

    // Function entry — insert trace at beginning of function body
    'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression'(path: any) {
      const node = path.node;
      const fnName = node.id?.name ?? '<anonymous>';
      if (annotations.skipFunction?.includes(fnName)) return;

      const line = node.loc?.start.line ?? 0;
      const params = (node.params || [])
        .filter((p: any) => t.isIdentifier(p))
        .map((p: any) => t.stringLiteral(p.name));

      const callTrace = t.expressionStatement(
        t.callExpression(t.identifier('__traceCall'), [
          t.numericLiteral(line),
          t.stringLiteral(fnName),
          t.arrayExpression(params),
        ]),
      );

      // Ensure body is a block statement
      if (t.isBlockStatement(node.body)) {
        node.body.body.unshift(callTrace);
      }
    },

    // For/while loops — trace at loop body start
    'ForStatement|WhileStatement|DoWhileStatement'(path: any) {
      const body = path.node.body;
      const line = path.node.loc?.start.line ?? 0;
      if (t.isBlockStatement(body)) {
        body.body.unshift(
          t.expressionStatement(buildTraceCall(line, 'line')),
        );
      }
    },

    // If statements — trace at branch entry
    IfStatement(path) {
      const line = path.node.loc?.start.line ?? 0;
      const consequent = path.node.consequent;
      if (t.isBlockStatement(consequent)) {
        consequent.body.unshift(
          t.expressionStatement(buildTraceCall(line, 'line')),
        );
      }
      if (path.node.alternate && t.isBlockStatement(path.node.alternate)) {
        path.node.alternate.body.unshift(
          t.expressionStatement(buildTraceCall(line, 'line')),
        );
      }
    },
  });

  const output = generate(ast, { retainLines: true });
  const instrumentedCode = preamble + '\n' + output.code + '\n__finalize();\n';

  return { instrumentedCode, annotations };
}

function buildTraceCall(line: number, event: string): t.Expression {
  return t.callExpression(t.identifier('__trace'), [
    t.numericLiteral(line),
    t.stringLiteral(event),
  ]);
}

function isTraceCall(node: t.ExpressionStatement): boolean {
  return (
    t.isCallExpression(node.expression) &&
    t.isIdentifier(node.expression.callee) &&
    (node.expression.callee.name === '__trace' ||
      node.expression.callee.name === '__traceCall' ||
      node.expression.callee.name === '__finalize')
  );
}

function buildPreamble(maxSteps: number, annotations: AnnotationConfig): string {
  return `
// === MapMyCode Runtime ===
const __steps = [];
let __stepCount = 0;
const __MAX_STEPS = ${maxSteps};
const __scopes = [{}];

function __captureVars() {
  const vars = {};
  for (let i = __scopes.length - 1; i >= 0; i--) {
    Object.assign(vars, __scopes[i]);
  }
  return vars;
}

function __classifyDS(value) {
  if (value === null || value === undefined) return 'primitive';
  if (Array.isArray(value)) {
    if (value.length > 0 && Array.isArray(value[0])) return 'array2d';
    return 'array';
  }
  if (typeof value !== 'object') return 'primitive';
  if (value instanceof Set) return 'set';
  if (value instanceof Map) return 'hashMap';
  if ('next' in value && 'val' in value) return 'linkedList';
  if ('left' in value && 'right' in value) return 'binaryTree';
  return 'object';
}

function __serializeValue(val, depth) {
  if (depth === undefined) depth = 0;
  if (depth > 4) return '...';
  if (val === null || val === undefined) return val;
  if (typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(function(v) { return __serializeValue(v, depth + 1); });
  if (val instanceof Set) return Array.from(val);
  if (val instanceof Map) {
    var obj = {};
    val.forEach(function(v, k) { obj[String(k)] = __serializeValue(v, depth + 1); });
    return obj;
  }
  var out = {};
  var keys = Object.keys(val);
  for (var i = 0; i < Math.min(keys.length, 50); i++) {
    out[keys[i]] = __serializeValue(val[keys[i]], depth + 1);
  }
  return out;
}

function __trace(line, event, fnName, args, retVal) {
  if (__stepCount >= __MAX_STEPS) return;
  __stepCount++;
  // Capture variables from the calling scope via injected assignments
  var step = {
    step: __stepCount,
    line: line,
    event: event,
    variables: [],
    functionName: fnName || undefined,
    args: args ? args.map(function(a) { return __serializeValue(a); }) : undefined,
    returnValue: retVal !== undefined ? __serializeValue(retVal) : undefined,
  };
  // Variables are captured via __registerVar calls
  var currentVars = __scopes[__scopes.length - 1];
  for (var name in currentVars) {
    var val = currentVars[name];
    step.variables.push({
      name: name,
      value: __serializeValue(val),
      type: typeof val,
      dsType: __classifyDS(val),
    });
  }
  __steps.push(step);
}

function __traceCall(line, fnName, paramNames) {
  __scopes.push({});
  __trace(line, 'call', fnName);
}

function __registerVar(name, value) {
  __scopes[__scopes.length - 1][name] = value;
}

function __finalize() {
  // Output the trace as JSON to stdout
  var result = JSON.stringify({
    steps: __steps,
    totalSteps: __steps.length,
    error: null,
  });
  if (typeof process !== 'undefined' && process.stdout) {
    process.stdout.write('__MAPMYCODE_TRACE_START__' + result + '__MAPMYCODE_TRACE_END__');
  }
}
// === End Runtime ===
`;
}
