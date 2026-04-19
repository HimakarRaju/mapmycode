"""
MapMyCode FastAPI Request Tracer — Injects middleware to track request flows.
Sends trace data via HTTP POST to the extension's local trace server.

Usage: Import and call inject_tracer(app, trace_port) before uvicorn.run()
"""
import time
import json
import uuid
import threading
import urllib.request


def inject_tracer(app, trace_port=9321):
    """Add request tracing middleware to a FastAPI app."""
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.requests import Request

    trace_url = f"http://127.0.0.1:{trace_port}/trace"

    class MapMyCodeMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            start = time.time()
            request_id = str(uuid.uuid4())[:8]
            error_msg = None
            status_code = 500

            try:
                response = await call_next(request)
                status_code = response.status_code
                return response
            except Exception as e:
                error_msg = str(e)
                raise
            finally:
                duration = (time.time() - start) * 1000
                trace = {
                    "id": request_id,
                    "timestamp": int(time.time() * 1000),
                    "method": request.method,
                    "path": str(request.url.path),
                    "statusCode": status_code,
                    "duration": round(duration, 2),
                    "middlewareChain": [],
                    "handler": request.url.path,
                    "requestHeaders": dict(request.headers),
                }
                if error_msg:
                    trace["error"] = error_msg
                _send_trace_async(trace_url, trace)

    app.add_middleware(MapMyCodeMiddleware)


def _send_trace_async(url, data):
    """Post trace data to the extension in a background thread."""
    def _post():
        try:
            payload = json.dumps(data).encode('utf-8')
            req = urllib.request.Request(
                url, data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=2)
        except Exception:
            pass
    threading.Thread(target=_post, daemon=True).start()
