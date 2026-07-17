import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Dev-only plugin backing the station-picker dev mode (?dev=1).
 * POST /__station-picker/save with a full manifest JSON body rewrites
 * assets/manifest.json on disk so picked stations persist.
 * Never part of the production build.
 */
function stationPickerWriter(): Plugin {
  return {
    name: 'l3rain-station-picker-writer',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__station-picker/save', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('method not allowed');
          return;
        }
        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString('utf-8');
        });
        req.on('end', () => {
          try {
            const parsed: unknown = JSON.parse(body);
            const file = path.resolve(__dirname, 'assets/manifest.json');
            fs.writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`, 'utf-8');
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), stationPickerWriter()],
  // Everything under assets/ is served (dev) and copied (build) at the web root:
  // assets/manifest.json  ->  /manifest.json
  // assets/characters-portraits/x.png -> /characters-portraits/x.png
  publicDir: 'assets',
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
