import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = env.API_AUTH_KEY || env.VITE_API_KEY || '';

  return {
    plugins: [react(), tailwindcss()],
    server: {
      allowedHosts: true,
      proxy: {
        '/api/backend': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/backend/, '/api'),
          headers: {
            'X-API-Key': apiKey,
          },
        },
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
          headers: {
            'X-API-Key': apiKey,
          },
        },
      },
    },
  };
});
