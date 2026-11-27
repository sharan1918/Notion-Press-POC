import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = env.API_AUTH_KEY || env.VITE_API_KEY || '';
  // Default to Kubernetes NodePort (30080), with fallback to local uvicorn (8000) if specified
  const backendTarget = env.BACKEND_PROXY_TARGET || 'http://127.0.0.1:30080';

  return {
    plugins: [react(), tailwindcss()],
    server: {
      allowedHosts: true,
      proxy: {
        '/api/backend': {
          target: backendTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/backend/, '/api'),
          headers: {
            'X-API-Key': apiKey,
          },
        },
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          headers: {
            'X-API-Key': apiKey,
          },
        },
      },
    },
  };
});
