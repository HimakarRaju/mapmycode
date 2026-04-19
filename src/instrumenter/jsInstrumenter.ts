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

  // Build the runtime preamble
  const preamble = buildPreamble(maxSteps, annotations);

  // Insert __trace() calls
  traverse(ast, {
    // After each expression statement
    ExpressionStatement(path) {
      if (isTraceCall(path.node)) return;
      const line = path.node.loc?.start.line ?? 0;

      const registerStatements: t.Statement[] = [];
      if (t.isAssignmentExpression(path.node.expression)) {
          registerStatements.push(...buildRegisterStatementsFromPattern(path.node.expression.left as t.LVal));
        }
        if (t.isUpdateExpression(path.node.expression) && t.isIdentifier(path.node.expression.argument)) {
          registerStatements.push(buildRegisterStatement(path.node.expression.argument.name));
        }

        path.insertAfter([...registerStatements, t.expressionStatement(buildTraceCall(line, 'line'))]);
      },

      // Variable declarations
      VariableDeclaration(path) {
        if (path.parentPath.isForStatement() || path.parentPath.isForInStatement() || path.parentPath.isForOfStatement()) return;
        const line = path.node.loc?.start.line ?? 0;
        const registerStatements = path.node.declarations.flatMap((decl) => buildRegisterStatementsFromPattern(decl.id as t.LVal));
        path.insertAfter([...registerStatements, t.expressionStatement(buildTraceCall(line, 'line'))]);
      },

      // Return statements — wrap to capture value
      ReturnStatement(path) {
        const line = path.node.loc?.start.line ?? 0;
        const fnName = getFunctionName(path.getFunctionParent()?.node, path.getFunctionParent()) ?? '<anonymous>';
        if (path.node.argument) {
        const tmpVar = path.scope.generateUidIdentifier('ret');
        const decl = t.variableDeclaration('const', [
          t.variableDeclarator(tmpVar, path.node.argument),
        ]);
        const traceCall = t.expressionStatement(
          t.callExpression(t.identifier('__traceReturn'), [
            t.numericLiteral(line),
            t.stringLiteral(fnName),
            tmpVar,
          ]),
        );
        const newReturn = t.returnStatement(tmpVar);
        path.replaceWithMultiple([decl, traceCall, newReturn]);
        path.skip();
      } else {
        path.insertBefore(
          t.expressionStatement(
            t.callExpression(t.identifier('__traceReturn'), [
              t.numericLiteral(line),
              t.stringLiteral(fnName),
            ]),
          ),
        );
      }
    },

    // Function entry — insert trace at beginning of function body
    'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|ClassMethod|ObjectMethod'(path: any) {
      const node = path.node;
      const fnName = getFunctionName(node, path) ?? '<anonymous>';
      if (annotations.skipFunction?.includes(fnName)) return;

      const line = node.loc?.start.line ?? 0;
      const params = (node.params || [])
        .filter((p: any) => t.isIdentifier(p))
        .map((p: any) => p.name);

      const callTrace = t.expressionStatement(
        t.callExpression(t.identifier('__traceCall'), [
          t.numericLiteral(line),
          t.stringLiteral(fnName),
          t.arrayExpression(params.map((name: string) => t.stringLiteral(name))),
          t.arrayExpression(params.map((name: string) => t.identifier(name))),
        ]),
      );

      // Ensure body is a block statement
      if (t.isBlockStatement(node.body)) {
        node.body.body.unshift(callTrace);
        if (!endsWithReturnStatement(node.body.body)) {
          node.body.body.push(
            t.expressionStatement(
              t.callExpression(t.identifier('__traceReturn'), [
                t.numericLiteral(node.body.loc?.end.line ?? line),
                t.stringLiteral(fnName),
              ]),
            ),
          );
        }
      } else if (t.isArrowFunctionExpression(node)) {
        const originalBody = node.body;
        const tmpVar = path.scope.generateUidIdentifier('ret');
        node.body = t.blockStatement([
          callTrace,
          t.variableDeclaration('const', [t.variableDeclarator(tmpVar, originalBody)]),
          t.expressionStatement(
            t.callExpression(t.identifier('__traceReturn'), [
              t.numericLiteral(node.loc?.end.line ?? line),
              t.stringLiteral(fnName),
              tmpVar,
            ]),
          ),
          t.returnStatement(tmpVar),
        ]);
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

function buildRegisterStatement(name: string): t.Statement {
  return t.expressionStatement(
    t.callExpression(t.identifier('__registerVar'), [
      t.stringLiteral(name),
      t.identifier(name),
    ]),
  );
}

function buildRegisterStatementsFromPattern(pattern: t.LVal): t.Statement[] {
  if (t.isIdentifier(pattern)) {
    return [buildRegisterStatement(pattern.name)];
  }

  if (t.isRestElement(pattern)) {
    return buildRegisterStatementsFromPattern(pattern.argument as t.LVal);
  }

  if (t.isObjectPattern(pattern)) {
    return pattern.properties.flatMap((property) => {
      if (t.isRestElement(property)) {
        return buildRegisterStatementsFromPattern(property.argument as t.LVal);
      }
      if (t.isObjectProperty(property)) {
        return buildRegisterStatementsFromPattern(property.value as t.LVal);
      }
      return [];
    });
  }

  if (t.isArrayPattern(pattern)) {
    return pattern.elements.flatMap((element) => {
      if (!element) {
        return [];
      }
      if (t.isRestElement(element)) {
        return buildRegisterStatementsFromPattern(element.argument as t.LVal);
      }
      return buildRegisterStatementsFromPattern(element as t.LVal);
    });
  }

  return [];
}

function isTraceCall(node: t.ExpressionStatement): boolean {
  return (
    t.isCallExpression(node.expression) &&
    t.isIdentifier(node.expression.callee) &&
    (node.expression.callee.name === '__trace' ||
      node.expression.callee.name === '__traceCall' ||
      node.expression.callee.name === '__traceReturn' ||
      node.expression.callee.name === '__registerVar' ||
      node.expression.callee.name === '__finalize')
  );
}

function endsWithReturnStatement(body: t.Statement[]): boolean {
  return body.length > 0 && t.isReturnStatement(body[body.length - 1]);
}

function getFunctionName(node: any, path?: any): string | undefined {
  if (!node) {
    return undefined;
  }

  if (node.id?.name) {
    return node.id.name;
  }

  if (path?.parentPath?.isVariableDeclarator() && t.isIdentifier(path.parentPath.node.id)) {
    return path.parentPath.node.id.name;
  }

  if ((path?.isObjectMethod?.() || path?.parentPath?.isObjectProperty?.()) && node.key) {
    if (t.isIdentifier(node.key)) {
      return node.key.name;
    }
    if (t.isStringLiteral(node.key)) {
      return node.key.value;
    }
  }

  if (path?.isClassMethod?.() && node.key && t.isIdentifier(node.key)) {
    return node.key.name;
  }

  return undefined;
}

function buildPreamble(maxSteps: number, annotations: AnnotationConfig): string {
  return `
// === MapMyCode Runtime ===
const __steps = [];
let __stepCount = 0;
const __MAX_STEPS = ${maxSteps};
const __scopes = [{}];

function __classifyDS(value) {
  if (value === null || value === undefined) return 'primitive';
  if (Array.isArray(value)) {
    if (value.length > 0 && Array.isArray(value[0])) return 'array2d';
    return 'array';
  }
  if (typeof value !== 'object') return 'primitive';
  if (value instanceof Set) return 'set';
  if (value instanceof Map) return 'hashMap';
  if (value && typeof value === 'object') {
    var ctorName = value.constructor && value.constructor.name ? String(value.constructor.name).toLowerCase() : '';
    if (ctorName.indexOf('queue') >= 0 || ctorName.indexOf('deque') >= 0) return 'queue';
    if (ctorName.indexOf('stack') >= 0) return 'stack';
    if (ctorName.indexOf('graph') >= 0) return 'graph';
  }
  if ('next' in value && 'val' in value) return 'linkedList';
  if ('left' in value && 'right' in value) return 'binaryTree';
  if (__looksLikeGraph(value)) return 'graph';
  return 'object';
}

function __looksLikeGraph(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  var keys = Object.keys(value);
  if (keys.length === 0) return false;
  for (var i = 0; i < Math.min(keys.length, 12); i++) {
    var neighbors = value[keys[i]];
    if (Array.isArray(neighbors)) continue;
    if (neighbors && typeof neighbors === 'object' && ('neighbors' in neighbors || 'edges' in neighbors)) continue;
    return false;
  }
  return true;
}

function __serializeValue(val, depth) {
  if (depth === undefined) depth = 0;
  if (depth > 4) return '...';
  if (val === null || val === undefined) return val;
  if (typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(function(v) { return __serializeValue(v, depth + 1); });
  if (val instanceof Set) return Array.from(val).map(function(v) { return __serializeValue(v, depth + 1); });
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
  if (event === 'return' && __scopes.length > 1) {
    __scopes.pop();
  }
}

function __traceCall(line, fnName, paramNames, args) {
  __scopes.push({});
  if (Array.isArray(paramNames) && Array.isArray(args)) {
    for (var i = 0; i < paramNames.length; i++) {
      __registerVar(paramNames[i], args[i]);
    }
  }
  __trace(line, 'call', fnName, args || undefined);
}

function __traceReturn(line, fnName, retVal) {
  __trace(line, 'return', fnName, undefined, retVal);
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
