import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/seed/run.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: ['@wailers/shared'],
});
