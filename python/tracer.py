"""
MapMyCode Python Tracer — Uses sys.settrace to capture execution trace.
Outputs JSON trace to stdout wrapped in delimiters.

Usage: python tracer.py <script_path> <max_steps>
"""
import sys
import os
import json
import types
import copy

MAX_STEPS = int(sys.argv[2]) if len(sys.argv) > 2 else 5000
TRACE_STEPS = []
STEP_COUNT = 0
SCOPE_STACK = [{}]
SCRIPT_PATH = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else ''


def classify_ds(value):
    """Classify a Python value into a data structure type."""
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
        return 'hashMap'
    # Check for linked list (has .val and .next)
    if hasattr(value, 'val') and hasattr(value, 'next'):
        return 'linkedList'
    # Check for binary tree (has .val and .left and .right)
    if hasattr(value, 'val') and hasattr(value, 'left') and hasattr(value, 'right'):
        return 'binaryTree'
    return 'object'


def serialize_value(val, depth=0):
    """Serialize a Python value for JSON output."""
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
    # Objects with attributes
    if hasattr(val, '__dict__'):
        out = {}
        for k, v in list(val.__dict__.items())[:50]:
            out[str(k)] = serialize_value(v, depth + 1)
        return out
    return str(val)


def capture_variables(frame):
    """Capture local and global variables from a frame."""
    variables = []
    # Capture locals
    for name, value in frame.f_locals.items():
        if name.startswith('_') and name != '_':
            continue
        if isinstance(value, (types.ModuleType, types.FunctionType, type)):
            continue
        variables.append({
            'name': name,
            'value': serialize_value(value),
            'type': type(value).__name__,
            'dsType': classify_ds(value),
        })
    return variables


def trace_function(frame, event, arg):
    """sys.settrace callback."""
    global STEP_COUNT

    # Only trace the user's script
    filename = os.path.abspath(frame.f_code.co_filename)
    if filename != SCRIPT_PATH:
        return trace_function

    if STEP_COUNT >= MAX_STEPS:
        return None

    STEP_COUNT += 1
    line = frame.f_lineno
    fn_name = frame.f_code.co_name

    step = {
        'step': STEP_COUNT,
        'line': line,
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
        'error': error,
    })
    sys.stdout.write(f'__MAPMYCODE_TRACE_START__{result}__MAPMYCODE_TRACE_END__')


if __name__ == '__main__':
    main()
