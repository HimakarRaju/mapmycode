"""
MapMyCode Flask Request Tracer — Injects middleware to track request flows.
Sends trace data via HTTP POST to the extension's local trace server.

Usage: Import and call inject_tracer(app, trace_port) before app.run()
"""
import time
import json
import uuid
import threading
import urllib.request
from functools import wraps


def inject_tracer(app, trace_port=9321):
    """Add request tracing middleware to a Flask app."""
    trace_url = f"http://127.0.0.1:{trace_port}/trace"

    @app.before_request
    def _mapmycode_before():
        from flask import request, g
        g._mapmycode_start = time.time()
        g._mapmycode_id = str(uuid.uuid4())[:8]
        g._mapmycode_mw_chain = []

    @app.after_request
    def _mapmycode_after(response):
        from flask import request, g
        duration = (time.time() - getattr(g,
                    '_mapmycode_start', time.time())) * 1000
        trace = {
            "id": getattr(g, '_mapmycode_id', '?'),
            "timestamp": int(time.time() * 1000),
            "method": request.method,
            "path": request.path,
            "statusCode": response.status_code,
            "duration": round(duration, 2),
            "middlewareChain": getattr(g, '_mapmycode_mw_chain', []),
            "handler": request.endpoint or "unknown",
            "requestHeaders": dict(request.headers),
        }
        # Send async to avoid slowing down the response
        _send_trace_async(trace_url, trace)
        return response

    @app.errorhandler(Exception)
    def _mapmycode_error(error):
        from flask import request, g
        duration = (time.time() - getattr(g,
                    '_mapmycode_start', time.time())) * 1000
        trace = {
            "id": getattr(g, '_mapmycode_id', '?'),
            "timestamp": int(time.time() * 1000),
            "method": request.method,
            "path": request.path,
            "statusCode": 500,
            "duration": round(duration, 2),
            "middlewareChain": getattr(g, '_mapmycode_mw_chain', []),
            "handler": request.endpoint or "unknown",
            "error": str(error),
        }
        _send_trace_async(trace_url, trace)
        raise error


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
            pass  # Don't crash the app if extension isn't listening
    threading.Thread(target=_post, daemon=True).start()
