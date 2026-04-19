"""
MapMyCode Python Tracer — Uses sys.settrace to capture execution trace.
Outputs JSON trace to stdout wrapped in delimiters.

Usage: python tracer.py <script_path> <max_steps>
"""
import sys
import os
import json
import types

MAX_STEPS = int(sys.argv[2]) if len(sys.argv) > 2 else 5000
TRACE_STEPS = []
STEP_COUNT = 0
SCOPE_STACK = [{}]
SCRIPT_PATH = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else ''
IMPORT_ROOTS = [
    os.path.abspath(root)
    for root in os.environ.get('MAPMYCODE_IMPORT_ROOTS', '').split(os.pathsep)
    if root
]

TRACED_FILES = {}


def is_user_code(filepath, original_filename=""):
    if original_filename.startswith('<') and original_filename.endswith('>'):
        return False

    if filepath.lower() == SCRIPT_PATH.lower():
        return True
    if not IMPORT_ROOTS:
        return False

    parts = filepath.split(os.sep)
    # Ignore standard library, installed packages, etc.
    if any(p.lower() in ('.venv', 'venv', 'env', 'site-packages', 'dist-packages', 'node_modules', 'lib', 'bin', 'python', 'python3') for p in parts):
        return False

    filepath_lower = filepath.lower()
    for root in IMPORT_ROOTS:
        if filepath_lower.startswith(root.lower()):
            return True

    return False


def _apply_flask_patches():
    # Attempt to monkey-patch Flask and Flask-SocketIO to prevent blocking the file tracer
    import sys
    try:
        import importlib.util
        if importlib.util.find_spec('flask'):
            import flask

            def safe_flask_run(*args, **kwargs):
                print(
                    "[MapMyCode] Suppressed Flask.run() during file trace to prevent blocking. Use 'Visualize Web App' to trace requests.")
                pass
            flask.Flask.run = safe_flask_run
    except Exception:
        pass
    try:
        import importlib.util
        if importlib.util.find_spec('flask_socketio'):
            import flask_socketio

            def safe_socketio_run(*args, **kwargs):
                print("[MapMyCode] Suppressed SocketIO.run() during file trace to prevent blocking. Use 'Visualize Web App' to trace requests.")
                pass
            flask_socketio.SocketIO.run = safe_socketio_run
    except Exception:
        pass


FRAMEWORK_MODULE_PREFIXES = (
    'flask',
    'werkzeug',
    'jinja2',
    'sqlalchemy',
    'socketio',
    'engineio',
    'fastapi',
    'starlette',
    'uvicorn',
)


def classify_ds(value):
    """Classify a Python value into a data structure type."""
    try:
        if value is None or isinstance(value, (int, float, str, bool)):
            return 'primitive'
        if isinstance(value, list):
            if len(value) > 0 and isinstance(value[0], list):
                return 'array2d'
            return 'array'
        if isinstance(value, tuple):
            return 'array'
        if isinstance(value, set):
            return 'set'
        if isinstance(value, dict):
            if looks_like_graph(value):
                return 'graph'
            return 'hashMap'
        if is_framework_object(value):
            return 'object'

        type_name = safe_type_name(value).lower()
        if 'deque' in type_name or 'queue' in type_name:
            return 'queue'
        if 'stack' in type_name:
            return 'stack'
        if 'graph' in type_name:
            return 'graph'
        # Check for linked list (has .val or .value and .next)
        if (safe_hasattr(value, 'val') or safe_hasattr(value, 'value')) and safe_hasattr(value, 'next'):
            return 'linkedList'
        # Check for binary tree (has .val or .value and .left and .right)
        if (safe_hasattr(value, 'val') or safe_hasattr(value, 'value')) and safe_hasattr(value, 'left') and safe_hasattr(value, 'right'):
            return 'binaryTree'
        return 'object'
    except Exception:
        return 'unknown'


def looks_like_graph(value):
    if not isinstance(value, dict) or not value:
        return False

    sample = list(value.items())[:12]
    for _, neighbors in sample:
        if isinstance(neighbors, (list, tuple, set)):
            if not all(isinstance(neighbor, (str, int, float)) or (isinstance(neighbor, dict) and ('to' in neighbor or 'node' in neighbor)) for neighbor in neighbors):
                return False
            continue
        if isinstance(neighbors, dict) and ('neighbors' in neighbors or 'edges' in neighbors):
            continue
        return False

    return True


def serialize_value(val, depth=0):
    """Serialize a Python value for JSON output."""
    try:
        if depth > 4:
            return '...'
        if val is None:
            return None
        if isinstance(val, (int, float, str, bool)):
            return val
        if isinstance(val, (list, tuple)):
            return [serialize_value(v, depth + 1) for v in val[:200]]
        if isinstance(val, set):
            return [serialize_value(v, depth + 1) for v in list(val)[:200]]
        if isinstance(val, dict):
            out = {}
            for i, (k, v) in enumerate(val.items()):
                if i >= 50:
                    break
                out[str(k)] = serialize_value(v, depth + 1)
            return out
        if is_framework_object(val):
            return f'<{safe_module_name(val)}.{safe_type_name(val)}>'

        object_dict = safe_get_object_dict(val)
        if object_dict:
            out = {}
            for i, (k, v) in enumerate(list(object_dict.items())[:50]):
                out[str(k)] = serialize_value(v, depth + 1)
            return out

        return safe_stringify(val)
    except Exception as exc:
        return f'<unserializable: {type(exc).__name__}>'


def capture_variables(frame):
    """Capture local and global variables from a frame."""
    variables = []
    # Capture locals
    for name, value in frame.f_locals.items():
        if name.startswith('_') and name != '_':
            continue
        if isinstance(value, (types.ModuleType, types.FunctionType, type)):
            continue
        try:
            variables.append({
                'name': name,
                'value': serialize_value(value),
                'type': safe_type_name(value),
                'dsType': classify_ds(value),
            })
        except Exception as exc:
            variables.append({
                'name': name,
                'value': f'<unavailable: {type(exc).__name__}>',
                'type': safe_type_name(value),
                'dsType': 'unknown',
            })
    return variables


def safe_hasattr(value, attr_name):
    try:
        getattr(value, attr_name)
        return True
    except Exception:
        return False


def safe_get_object_dict(value):
    try:
        object_dict = object.__getattribute__(value, '__dict__')
        return object_dict if isinstance(object_dict, dict) else None
    except Exception:
        return None


def safe_type_name(value):
    try:
        return type(value).__name__
    except Exception:
        return 'unknown'


def safe_module_name(value):
    try:
        return type(value).__module__
    except Exception:
        return 'unknown'


def is_framework_object(value):
    module_name = safe_module_name(value)
    return any(module_name.startswith(prefix) for prefix in FRAMEWORK_MODULE_PREFIXES)


def safe_stringify(value):
    try:
        return str(value)
    except Exception as exc:
        return f'<unprintable: {type(exc).__name__}>'


def trace_function(frame, event, arg):
    """sys.settrace callback."""
    global STEP_COUNT

    filename = os.path.abspath(frame.f_code.co_filename)
    if not is_user_code(filename, frame.f_code.co_filename):
        return None

    if STEP_COUNT >= MAX_STEPS:
        return None

    if filename not in TRACED_FILES:
        try:
            with open(filename, 'r', encoding='utf-8') as src_fh:
                TRACED_FILES[filename] = src_fh.read()
        except:
            TRACED_FILES[filename] = "<source code unavailable>"

    STEP_COUNT += 1
    line = frame.f_lineno
    fn_name = frame.f_code.co_name
    if fn_name == '<module>':
        fn_name = f"<{os.path.basename(filename)}>"

    step = {
        'step': STEP_COUNT,
        'line': line,
        'file': filename,
        'event': event if event in ('call', 'return', 'exception') else 'line',
        'variables': capture_variables(frame),
    }

    if event == 'call':
        step['functionName'] = fn_name
        # Capture arguments
        argcount = frame.f_code.co_argcount
        varnames = frame.f_code.co_varnames[:argcount]
        step['args'] = [serialize_value(
            frame.f_locals.get(v)) for v in varnames]

    if event == 'return':
        step['functionName'] = fn_name
        step['returnValue'] = serialize_value(arg)

    if event == 'exception':
        step['functionName'] = fn_name

    TRACE_STEPS.append(step)
    return trace_function


def main():
    if len(sys.argv) < 2:
        print(
            'Usage: python tracer.py <script_path> [max_steps]', file=sys.stderr)
        sys.exit(1)

    script_path = sys.argv[1]
    if not os.path.isfile(script_path):
        print(f'File not found: {script_path}', file=sys.stderr)
        sys.exit(1)

    with open(script_path, 'r', encoding='utf-8') as f:
        code = f.read()

    for import_root in reversed(IMPORT_ROOTS):
        if os.path.isdir(import_root) and import_root not in sys.path:
            sys.path.insert(0, import_root)

    _apply_flask_patches()

    error = None
    sys.settrace(trace_function)
    try:
        exec(compile(code, script_path, 'exec'), {
             '__name__': '__main__', '__file__': script_path})
    except Exception as e:
        error = f'{type(e).__name__}: {e}'
    finally:
        sys.settrace(None)

    result = json.dumps({
        'steps': TRACE_STEPS,
        'totalSteps': len(TRACE_STEPS),
        'files': TRACED_FILES,
        'error': error,
    })
    sys.stdout.write(
        f'__MAPMYCODE_TRACE_START__{result}__MAPMYCODE_TRACE_END__')


if __name__ == '__main__':
    main()
