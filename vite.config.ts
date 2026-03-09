import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';

/**
 * Vite plugin to serve ONNX runtime WASM files.
 * The ONNX runtime does a dynamic import() of ort-wasm-simd-threaded.mjs
 * which Vite's dep optimizer can't resolve. This plugin intercepts
 * those requests and serves the files from node_modules.
 */
function serveOnnxWasm(): Plugin {
  const onnxDist = resolve(__dirname, 'node_modules/onnxruntime-web/dist');

  // Shared middleware for both dev and preview servers
  const onnxMiddleware = (req: any, res: any, next: any) => {
    const url = req.url ?? '';

    // Serve the ONNX WASM JS glue module
    if (url.includes('ort-wasm-simd-threaded.mjs')) {
      try {
        const content = readFileSync(resolve(onnxDist, 'ort-wasm-simd-threaded.mjs'), 'utf-8');
        res.setHeader('Content-Type', 'application/javascript');
        res.end(content);
        return;
      } catch { /* fall through */ }
    }

    // Serve the ONNX WASM binary
    if (url.includes('ort-wasm-simd-threaded.wasm')) {
      try {
        const content = readFileSync(resolve(onnxDist, 'ort-wasm-simd-threaded.wasm'));
        res.setHeader('Content-Type', 'application/wasm');
        res.end(content);
        return;
      } catch { /* fall through */ }
    }

    next();
  };

  return {
    name: 'serve-onnx-wasm',
    configureServer(server) {
      server.middlewares.use(onnxMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(onnxMiddleware);
    },
  };
}

export default defineConfig({
  plugins: [serveOnnxWasm()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3005,
    allowedHosts: ['wendy-box-1.tailc1ea15.ts.net'],
  },
  assetsInclude: ['**/*.glb', '**/*.gltf'],
});
