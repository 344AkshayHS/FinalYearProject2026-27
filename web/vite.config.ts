import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const here = (folder: string) => fileURLToPath(new URL(folder, import.meta.url));

// Two short names for imports:
//   "~/..."  is this website's own code (web/src)
//   "@/..."  is the phone app's code (frontend/src). Only its plain TypeScript files are used here (the English and
//            Kannada texts, crop facts, chat rules, water formula), so the website and the app always agree.
//            The website only reads these files; it never changes them.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: { alias: { '~': here('./src'), '@': here('../frontend/src') } },
    server: {
      port: 5173,
      fs: { allow: ['..'] }, // lets the dev server read ../frontend/src
      // The website calls the backend as "/api/..." on its own address, so the browser sees one site:
      // no CORS, and the login cookie stays on that site. API_TARGET (in web/.env) says where the backend is.
      proxy: { '/api': env.API_TARGET || 'http://localhost:4000' },
    },
  };
});
