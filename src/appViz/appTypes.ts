/**
 * Types shared across all app visualization components.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD' | 'ALL';

export interface RouteInfo {
  method: HttpMethod;
  path: string;
  handler: string;
  file: string;
  line: number;
  middleware: string[];
  /** For grouped/blueprint routes */
  group?: string;
  /** Parameter schema (FastAPI/NestJS) */
  params?: ParamInfo[];
  /** Response model name */
  responseModel?: string;
}

export interface ParamInfo {
  name: string;
  type: string;
  location: 'path' | 'query' | 'body' | 'header';
  required: boolean;
}

export interface MiddlewareInfo {
  name: string;
  file: string;
  line: number;
  /** Global or route-specific */
  scope: 'global' | 'route' | 'group';
  /** Which routes it applies to */
  appliesTo?: string;
}

export interface AppModel {
  name: string;
  file: string;
  line: number;
  fields: { name: string; type: string }[];
}

export interface AppStructure {
  framework: string;
  routes: RouteInfo[];
  middleware: MiddlewareInfo[];
  models: AppModel[];
  entryFile: string;
  projectRoot: string;
  /** Errors encountered during analysis */
  warnings: string[];
}

export interface RequestTrace {
  id: string;
  timestamp: number;
  method: HttpMethod;
  path: string;
  statusCode: number;
  duration: number;
  middlewareChain: MiddlewareHit[];
  handler: string;
  requestHeaders: Record<string, string>;
  requestBody?: any;
  responseBody?: any;
  error?: string;
}

export interface MiddlewareHit {
  name: string;
  duration: number;
  order: number;
}

export interface LiveAppState {
  isRunning: boolean;
  pid?: number;
  port?: number;
  framework: string;
  requests: RequestTrace[];
  structure: AppStructure;
}
