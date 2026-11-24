import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createApiHandler } from './server/api.ts';

/** Serves /api/ai/* from the dev server, using settings from .env (server-side only). */
function aiApi(mode: string): Plugin {
  return {
    name: 'rs-analytics-ai-api',
    configureServer(server) {
      // '' prefix = load every variable, not just VITE_*. They stay in Node; nothing reaches the browser.
      const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };
      const handle = createApiHandler(env);
      server.middlewares.use((req, res, next) => {
        handle(req, res).then((done) => (done ? undefined : next()), next);
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), aiApi(mode)],
}));
