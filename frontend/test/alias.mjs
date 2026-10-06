// Lets `node --test` run the app's plain TypeScript files (Node runs TypeScript itself since version 23.6):
// "@/lib/season" means src/lib/season.ts, as in tsconfig.json. Run with: npm test
import { registerHooks } from 'node:module';

const src = new URL('../src/', import.meta.url);

registerHooks({
  resolve(specifier, context, next) {
    return next(specifier.startsWith('@/') ? new URL(specifier.slice(2) + '.ts', src).href : specifier, context);
  },
});
