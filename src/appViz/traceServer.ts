import * as http from 'http';
import * as vscode from 'vscode';
import type { RequestTrace } from './appTypes';

const DEFAULT_PORT = 9321;
const MAX_REQUESTS = 500;

/**
 * Lightweight HTTP server that receives trace data from instrumented web apps.
 * Runs on localhost only. Forwards request traces to the webview.
 */
export class TraceServer {
  private server: http.Server | null = null;
  private requests: RequestTrace[] = [];
  private onTrace: ((trace: RequestTrace) => void) | null = null;
  private port: number = DEFAULT_PORT;

  get tracePort(): number {
    return this.port;
  }

  get recentRequests(): RequestTrace[] {
    return this.requests;
  }

  setOnTrace(callback: (trace: RequestTrace) => void) {
    this.onTrace = callback;
  }

  async start(): Promise<number> {
    if (this.server) return this.port;

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        // Only accept POST /trace from localhost
        if (req.method !== 'POST' || req.url !== '/trace') {
          res.writeHead(404);
          res.end();
          return;
        }

        // Verify request comes from localhost
        const remoteAddr = req.socket.remoteAddress;
        if (remoteAddr !== '127.0.0.1' && remoteAddr !== '::1' && remoteAddr !== '::ffff:127.0.0.1') {
          res.writeHead(403);
          res.end();
          return;
        }

        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
          // Limit body size to 1MB
          if (body.length > 1024 * 1024) {
            res.writeHead(413);
            res.end();
            req.destroy();
          }
        });

        req.on('end', () => {
          try {
            const trace: RequestTrace = JSON.parse(body);
            this.addRequest(trace);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"ok":true}');
          } catch {
            res.writeHead(400);
            res.end('{"error":"Invalid JSON"}');
          }
        });
      });

      // Listen on localhost only
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
        }
        resolve(this.port);
      });

      this.server.on('error', (err) => {
        reject(err);
      });
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  clear() {
    this.requests = [];
  }

  private addRequest(trace: RequestTrace) {
    this.requests.push(trace);
    // Cap stored requests
    if (this.requests.length > MAX_REQUESTS) {
      this.requests = this.requests.slice(-MAX_REQUESTS);
    }
    this.onTrace?.(trace);
  }
}
