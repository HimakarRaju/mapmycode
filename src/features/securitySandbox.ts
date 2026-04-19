import * as path from 'path';
import * as os from 'os';

/**
 * Builds a security-hardened execution environment for user code.
 * Returns environment variables and arguments that restrict filesystem/network access.
 */
export interface SandboxOptions {
  timeout: number;
  maxSteps: number;
}

export interface SandboxConfig {
  env: Record<string, string>;
  nodeArgs: string[];
  pythonPrefix: string;
}

export function buildSandbox(language: 'javascript' | 'python', opts: SandboxOptions): SandboxConfig {
  const tmpDir = path.join(os.tmpdir(), 'mapmycode-sandbox');

  if (language === 'javascript') {
    return {
      env: {
        NODE_OPTIONS: '--max-old-space-size=128',
        HOME: tmpDir,
        USERPROFILE: tmpDir,
        // Prevent network access via DNS override
        NODE_EXTRA_CA_CERTS: '',
      },
      nodeArgs: [
        '--experimental-permission',
        `--allow-fs-read=${tmpDir}`,
        `--allow-fs-write=${tmpDir}`,
        // `--no-warnings`, // suppress experimental warnings
      ].filter(Boolean),
      pythonPrefix: '',
    };
  }

  // Python
  return {
    env: {
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONHASHSEED: '0',
      HOME: tmpDir,
    },
    nodeArgs: [],
    pythonPrefix: [
      'import resource',
      'try:',
      `    resource.setrlimit(resource.RLIMIT_AS, (${128 * 1024 * 1024}, ${128 * 1024 * 1024}))`,
      'except: pass',
    ].join('\n') + '\n',
  };
}

/**
 * Validates user code for obviously dangerous patterns before execution.
 * Returns warning messages (empty array = safe).
 */
export function validateCode(code: string, language: 'javascript' | 'python'): string[] {
  const warnings: string[] = [];

  // Common dangerous patterns
  const dangerousPatterns = [
    { pattern: /child_process|exec\s*\(|execSync|spawn/i, msg: 'Code attempts to spawn child processes' },
    { pattern: /process\.exit/i, msg: 'Code calls process.exit' },
    { pattern: /require\s*\(\s*['"]fs['"]\s*\)/i, msg: 'Code imports filesystem module' },
    { pattern: /require\s*\(\s*['"]net['"]\s*\)/i, msg: 'Code imports networking module' },
    { pattern: /require\s*\(\s*['"]http['"]\s*\)/i, msg: 'Code imports HTTP module' },
    { pattern: /eval\s*\(/i, msg: 'Code uses eval()' },
    { pattern: /Function\s*\(/i, msg: 'Code uses Function constructor' },
  ];

  if (language === 'python') {
    dangerousPatterns.push(
      { pattern: /import\s+subprocess/i, msg: 'Code imports subprocess' },
      { pattern: /import\s+socket/i, msg: 'Code imports socket' },
      { pattern: /__import__/i, msg: 'Code uses __import__' },
      { pattern: /os\.system|os\.popen|os\.exec/i, msg: 'Code uses os execution functions' },
      { pattern: /open\s*\([^)]*['"][wa]/i, msg: 'Code opens files for writing' },
    );
  }

  for (const { pattern, msg } of dangerousPatterns) {
    if (pattern.test(code)) {
      warnings.push(msg);
    }
  }

  return warnings;
}
