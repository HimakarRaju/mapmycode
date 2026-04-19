/// <reference types="node" />
// @ts-check
const esbuild = require('esbuild');
const fs = require('fs');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !production,
  minify: production,
  treeShaking: true,
};

/** @type {esbuild.BuildOptions} */
const webviewConfig = {
  entryPoints: ['src/webview/app/index.tsx'],
  bundle: true,
  outfile: 'dist/webview.js',
  format: 'esm',
  platform: 'browser',
  target: 'es2021',
  sourcemap: !production,
  minify: production,
  treeShaking: true,
  define: {
    'process.env.NODE_ENV': production ? '"production"' : '"development"',
  },
};

async function main() {
  fs.rmSync('dist', { recursive: true, force: true });

  if (watch) {
    const extCtx = await esbuild.context(extensionConfig);
    const webCtx = await esbuild.context(webviewConfig);
    await Promise.all([extCtx.watch(), webCtx.watch()]);
    console.log('[watch] Build started...');
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(webviewConfig),
    ]);
    console.log('[build] Done.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
