import { build } from 'esbuild';
await build({
  entryPoints: ['apps/web/src/console.mjs'],
  outdir: 'dist', entryNames: '[name]', chunkNames: 'chunks/[name]-[hash]',
  bundle: true, splitting: true, platform: 'browser', format: 'esm', target: 'es2022',
  define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
});
