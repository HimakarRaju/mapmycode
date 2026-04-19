import * as fs from 'fs';
import * as path from 'path';
import type { RouteInfo, MiddlewareInfo, AppModel, AppStructure, HttpMethod } from './appTypes';

/**
 * Extract routes, middleware, and models from Flask projects via regex-based static analysis.
 */
export function analyzeFlaskApp(projectRoot: string, entryFile: string): AppStructure {
  const routes: RouteInfo[] = [];
  const middleware: MiddlewareInfo[] = [];
  const models: AppModel[] = [];
  const warnings: string[] = [];

  const pyFiles = collectPyFiles(projectRoot);

  for (const file of pyFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const lines = content.split('\n');

    // Find Flask app or Blueprint instances
    const appVars = extractFlaskAppVars(lines);
    const blueprints = extractFlaskBlueprints(lines, file);

    // Extract route decorators
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Match @app.route('/path', methods=['GET', 'POST'])
      // Match @app.get('/path'), @app.post('/path'), etc.
      // Match @blueprint.route(...)
      for (const appVar of [...appVars, ...blueprints.map((b) => b.name)]) {
        // @app.route('/path') or @app.route('/path', methods=[...])
        const routeMatch = line.match(
          new RegExp(`@${escapeRegex(appVar)}\\.route\\s*\\(\\s*['\"]([^'"]+)['\"](?:.*methods\\s*=\\s*\\[([^\\]]+)\\])?`),
        );
        if (routeMatch) {
          const routePath = routeMatch[1];
          const methodsStr = routeMatch[2];
          const methods = methodsStr
            ? methodsStr.split(',').map((m) => m.trim().replace(/['"]/g, '').toUpperCase() as HttpMethod)
            : ['GET' as HttpMethod];

          // Next non-decorator line is the function def
          const handlerName = findHandlerName(lines, i + 1);
          const blueprint = blueprints.find((b) => b.name === appVar);

          for (const method of methods) {
            routes.push({
              method,
              path: (blueprint?.prefix ?? '') + routePath,
              handler: handlerName,
              file: path.relative(projectRoot, file),
              line: i + 1,
              middleware: [],
              group: blueprint?.name,
            });
          }
          continue;
        }

        // @app.get('/path'), @app.post('/path'), etc.
        const shortMatch = line.match(
          new RegExp(`@${escapeRegex(appVar)}\\.(get|post|put|delete|patch)\\s*\\(\\s*['\"]([^'"]+)['\"]`),
        );
        if (shortMatch) {
          const method = shortMatch[1].toUpperCase() as HttpMethod;
          const routePath = shortMatch[2];
          const handlerName = findHandlerName(lines, i + 1);
          const blueprint = blueprints.find((b) => b.name === appVar);

          routes.push({
            method,
            path: (blueprint?.prefix ?? '') + routePath,
            handler: handlerName,
            file: path.relative(projectRoot, file),
            line: i + 1,
            middleware: [],
            group: blueprint?.name,
          });
        }
      }

      // Detect middleware: @app.before_request, @app.after_request, etc.
      for (const appVar of appVars) {
        const mwMatch = line.match(
          new RegExp(`@${escapeRegex(appVar)}\\.(before_request|after_request|before_first_request|teardown_request|errorhandler)`),
        );
        if (mwMatch) {
          const handlerName = findHandlerName(lines, i + 1);
          middleware.push({
            name: `${mwMatch[1]}: ${handlerName}`,
            file: path.relative(projectRoot, file),
            line: i + 1,
            scope: 'global',
          });
        }
      }
    }

    // Extract SQLAlchemy / Pydantic models
    extractPythonModels(lines, file, projectRoot, models);
  }

  return {
    framework: 'Flask',
    routes,
    middleware,
    models,
    entryFile: path.relative(projectRoot, entryFile),
    projectRoot,
    warnings,
  };
}

/**
 * Extract routes, middleware, and models from FastAPI projects.
 */
export function analyzeFastAPIApp(projectRoot: string, entryFile: string): AppStructure {
  const routes: RouteInfo[] = [];
  const middleware: MiddlewareInfo[] = [];
  const models: AppModel[] = [];
  const warnings: string[] = [];

  const pyFiles = collectPyFiles(projectRoot);

  for (const file of pyFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const lines = content.split('\n');

    // Find FastAPI app or APIRouter instances
    const appVars = extractFastAPIAppVars(lines);
    const routers = extractAPIRouters(lines, file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const appVar of [...appVars, ...routers.map((r) => r.name)]) {
        // @app.get('/path'), @router.post('/path'), etc.
        const routeMatch = line.match(
          new RegExp(`@${escapeRegex(appVar)}\\.(get|post|put|delete|patch|options|head)\\s*\\(\\s*['\"]([^'"]+)['\"]`),
        );
        if (routeMatch) {
          const method = routeMatch[1].toUpperCase() as HttpMethod;
          const routePath = routeMatch[2];
          const handlerName = findHandlerName(lines, i + 1);
          const router = routers.find((r) => r.name === appVar);

          // Try to extract response_model
          const responseModelMatch = line.match(/response_model\s*=\s*(\w+)/);
          // Try to extract params from handler function
          const params = extractFastAPIParams(lines, i + 1);

          routes.push({
            method,
            path: (router?.prefix ?? '') + routePath,
            handler: handlerName,
            file: path.relative(projectRoot, file),
            line: i + 1,
            middleware: [],
            group: router?.name,
            params,
            responseModel: responseModelMatch?.[1],
          });
        }
      }

      // Detect middleware: app.add_middleware(...)
      for (const appVar of appVars) {
        const mwMatch = line.match(
          new RegExp(`${escapeRegex(appVar)}\\.add_middleware\\s*\\(\\s*(\\w+)`),
        );
        if (mwMatch) {
          middleware.push({
            name: mwMatch[1],
            file: path.relative(projectRoot, file),
            line: i + 1,
            scope: 'global',
          });
        }

        // @app.middleware("http")
        const mwDecMatch = line.match(
          new RegExp(`@${escapeRegex(appVar)}\\.middleware\\s*\\(`),
        );
        if (mwDecMatch) {
          const handlerName = findHandlerName(lines, i + 1);
          middleware.push({
            name: handlerName,
            file: path.relative(projectRoot, file),
            line: i + 1,
            scope: 'global',
          });
        }
      }
    }

    // Extract Pydantic models
    extractPydanticModels(lines, file, projectRoot, models);
  }

  return {
    framework: 'FastAPI',
    routes,
    middleware,
    models,
    entryFile: path.relative(projectRoot, entryFile),
    projectRoot,
    warnings,
  };
}

// ─── Express.js Analyzer ────────────────────────────────────────────────────

/**
 * Extract routes, middleware, and models from Express.js projects.
 */
export function analyzeExpressApp(projectRoot: string, entryFile: string): AppStructure {
  const routes: RouteInfo[] = [];
  const middleware: MiddlewareInfo[] = [];
  const models: AppModel[] = [];
  const warnings: string[] = [];

  const jsFiles = collectJSFiles(projectRoot);

  for (const file of jsFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const lines = content.split('\n');

    // Find express() or Router() instances
    const appVars = extractExpressAppVars(lines);
    const routerVars = extractExpressRouterVars(lines);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const appVar of [...appVars, ...routerVars]) {
        // app.get('/path', handler) / router.post('/path', handler)
        const routeMatch = line.match(
          new RegExp(`${escapeRegex(appVar)}\\.(get|post|put|delete|patch|all|options|head)\\s*\\(\\s*['\`"]([^'"\`]+)['\`"]`),
        );
        if (routeMatch) {
          const method = routeMatch[1].toUpperCase() as HttpMethod;
          const routePath = routeMatch[2];

          // Extract middleware from args: app.get('/path', mw1, mw2, handler)
          const middlewareNames = extractExpressMiddlewareFromRoute(line);

          routes.push({
            method,
            path: routePath,
            handler: `${file}:${i + 1}`,
            file: path.relative(projectRoot, file),
            line: i + 1,
            middleware: middlewareNames,
          });
        }

        // app.use('/prefix', router) or app.use(middleware)
        const useMatch = line.match(
          new RegExp(`${escapeRegex(appVar)}\\.use\\s*\\((.+)\\)`),
        );
        if (useMatch) {
          const args = useMatch[1].trim();
          const pathMatch = args.match(/^['\`"]([^'"\`]+)['\`"]/);
          const mwPath = pathMatch ? pathMatch[1] : '/';

          middleware.push({
            name: args.replace(/['\`"]/g, '').slice(0, 80),
            file: path.relative(projectRoot, file),
            line: i + 1,
            scope: pathMatch ? 'group' : 'global',
            appliesTo: mwPath,
          });
        }
      }
    }
  }

  return {
    framework: 'Express.js',
    routes,
    middleware,
    models,
    entryFile: path.relative(projectRoot, entryFile),
    projectRoot,
    warnings,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function collectPyFiles(root: string): string[] {
  return walkFiles(root, ['.py'], 6);
}

function collectJSFiles(root: string): string[] {
  return walkFiles(root, ['.js', '.ts', '.mjs'], 6);
}

function walkFiles(root: string, extensions: string[], maxDepth: number): string[] {
  const results: string[] = [];
  const ignored = new Set(['node_modules', '__pycache__', 'venv', '.venv', '.git', 'dist', 'build', '.tox', '.mypy_cache', '.mapmycode']);

  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.isDirectory()) continue;
      if (ignored.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
        results.push(full);
      }
    }
  };
  walk(root, 0);
  return results;
}

function findHandlerName(lines: string[], startLine: number): string {
  for (let i = startLine; i < Math.min(startLine + 5, lines.length); i++) {
    // Python: def handler_name(...) or async def handler_name(...)
    const pyMatch = lines[i].match(/^\s*(?:async\s+)?def\s+(\w+)/);
    if (pyMatch) return pyMatch[1];
    // JS: function name(...) or const name = ...
    const jsMatch = lines[i].match(/^\s*(?:async\s+)?function\s+(\w+)/);
    if (jsMatch) return jsMatch[1];
    const varMatch = lines[i].match(/^\s*(?:const|let|var)\s+(\w+)\s*=/);
    if (varMatch) return varMatch[1];
    // Skip decorators and blank lines
    if (lines[i].trim() === '' || lines[i].trim().startsWith('@') || lines[i].trim().startsWith('//')) continue;
    break;
  }
  return '<anonymous>';
}

function extractFlaskAppVars(lines: string[]): string[] {
  const vars: string[] = [];
  for (const line of lines) {
    const m = line.match(/(\w+)\s*=\s*Flask\s*\(/);
    if (m) vars.push(m[1]);
  }
  return vars.length > 0 ? vars : ['app'];
}

function extractFlaskBlueprints(lines: string[], file: string): { name: string; prefix: string }[] {
  const blueprints: { name: string; prefix: string }[] = [];
  for (const line of lines) {
    const m = line.match(/(\w+)\s*=\s*Blueprint\s*\(\s*['\"](\w+)['\"]\s*(?:,.*url_prefix\s*=\s*['\"]([^'"]*)['\"])?/);
    if (m) {
      blueprints.push({ name: m[1], prefix: m[3] || '' });
    }
  }
  return blueprints;
}

function extractFastAPIAppVars(lines: string[]): string[] {
  const vars: string[] = [];
  for (const line of lines) {
    const m = line.match(/(\w+)\s*=\s*FastAPI\s*\(/);
    if (m) vars.push(m[1]);
  }
  return vars.length > 0 ? vars : ['app'];
}

function extractAPIRouters(lines: string[], file: string): { name: string; prefix: string }[] {
  const routers: { name: string; prefix: string }[] = [];
  for (const line of lines) {
    const m = line.match(/(\w+)\s*=\s*APIRouter\s*\((?:.*prefix\s*=\s*['\"]([^'"]*)['\"])?/);
    if (m) {
      routers.push({ name: m[1], prefix: m[2] || '' });
    }
  }
  return routers;
}

function extractFastAPIParams(lines: string[], startLine: number): { name: string; type: string; location: 'path' | 'query' | 'body'; required: boolean }[] {
  const params: { name: string; type: string; location: 'path' | 'query' | 'body'; required: boolean }[] = [];

  for (let i = startLine; i < Math.min(startLine + 5, lines.length); i++) {
    const defMatch = lines[i].match(/^\s*(?:async\s+)?def\s+\w+\s*\((.+)/);
    if (defMatch) {
      const argStr = defMatch[1].replace(/\)\s*[-:].*$/, '');
      const argParts = argStr.split(',');
      for (const part of argParts) {
        const trimmed = part.trim();
        if (!trimmed || trimmed === 'self' || trimmed === 'request') continue;
        const paramMatch = trimmed.match(/(\w+)\s*:\s*(.+)/);
        if (paramMatch) {
          const name = paramMatch[1];
          const typeStr = paramMatch[2].trim();
          let location: 'path' | 'query' | 'body' = 'query';
          if (typeStr.includes('Body') || typeStr.includes('BaseModel')) location = 'body';
          if (typeStr.includes('Path')) location = 'path';
          params.push({ name, type: typeStr, location, required: !typeStr.includes('=') && !typeStr.includes('None') });
        }
      }
      break;
    }
  }
  return params;
}

function extractPythonModels(lines: string[], file: string, projectRoot: string, models: AppModel[]) {
  for (let i = 0; i < lines.length; i++) {
    const classMatch = lines[i].match(/^\s*class\s+(\w+)\s*\(\s*(?:db\.Model|Model)\s*\)/);
    if (classMatch) {
      const model: AppModel = {
        name: classMatch[1],
        file: path.relative(projectRoot, file),
        line: i + 1,
        fields: [],
      };
      // Scan fields
      for (let j = i + 1; j < Math.min(i + 50, lines.length); j++) {
        if (lines[j].match(/^\s*class\s/) || (lines[j].trim() !== '' && !lines[j].startsWith(' ') && !lines[j].startsWith('\t'))) break;
        const fieldMatch = lines[j].match(/^\s+(\w+)\s*=\s*(?:db\.)?Column\s*\(\s*(?:db\.)?(\w+)/);
        if (fieldMatch) {
          model.fields.push({ name: fieldMatch[1], type: fieldMatch[2] });
        }
      }
      models.push(model);
    }
  }
}

function extractPydanticModels(lines: string[], file: string, projectRoot: string, models: AppModel[]) {
  for (let i = 0; i < lines.length; i++) {
    const classMatch = lines[i].match(/^\s*class\s+(\w+)\s*\(\s*(?:BaseModel|Schema)\s*\)/);
    if (classMatch) {
      const model: AppModel = {
        name: classMatch[1],
        file: path.relative(projectRoot, file),
        line: i + 1,
        fields: [],
      };
      for (let j = i + 1; j < Math.min(i + 50, lines.length); j++) {
        if (lines[j].match(/^\s*class\s/) || (lines[j].trim() !== '' && !lines[j].startsWith(' ') && !lines[j].startsWith('\t'))) break;
        const fieldMatch = lines[j].match(/^\s+(\w+)\s*:\s*(.+?)(?:\s*=|$)/);
        if (fieldMatch && !fieldMatch[1].startsWith('_') && !fieldMatch[1].startsWith('class')) {
          model.fields.push({ name: fieldMatch[1], type: fieldMatch[2].trim() });
        }
      }
      models.push(model);
    }
  }
}

function extractExpressAppVars(lines: string[]): string[] {
  const vars: string[] = [];
  for (const line of lines) {
    const m = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:express\s*\(\)|require\s*\(\s*['"]express['"]\s*\)\s*\(\))/);
    if (m) vars.push(m[1]);
  }
  return vars.length > 0 ? vars : ['app'];
}

function extractExpressRouterVars(lines: string[]): string[] {
  const vars: string[] = [];
  for (const line of lines) {
    const m = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:express\.)?Router\s*\(/);
    if (m) vars.push(m[1]);
  }
  return vars;
}

function extractExpressMiddlewareFromRoute(line: string): string[] {
  // app.get('/path', auth, validate, (req, res) => ...)
  // Extract identifiers between the path and the last argument
  const match = line.match(/\.\w+\s*\(\s*['"`][^'"`]+['"`]\s*,\s*(.+)\)/);
  if (!match) return [];
  const argsStr = match[1];
  const parts = argsStr.split(',').map((p) => p.trim());
  // Everything except the last arg (the handler) that's a simple identifier
  const mw: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    const cleaned = parts[i].trim();
    if (/^\w+$/.test(cleaned)) {
      mw.push(cleaned);
    }
  }
  return mw;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
