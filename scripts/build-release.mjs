import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist/release', { recursive: true });
await build({
  entryPoints: ['apps/release/main.mjs'],
  outfile: 'dist/release/main.js',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: ['es2022'],
  minify: true,
  inject: ['apps/release/browser-shim.mjs'],
  define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
  logLevel: 'info',
});
for (const file of ['index.html', 'release.css']) await copyFile(`apps/release/${file}`, `dist/release/${file}`);
