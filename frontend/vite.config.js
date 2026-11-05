import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const backendDir = fileURLToPath(new URL('../backend', import.meta.url));

export default defineConfig(({ mode }) => {
  // El puerto del backend se lee de backend/.env, así hay un único lugar
  // donde cambiarlo. El tercer argumento filtra: solo se lee PORT, no la API key.
  const backendEnv = loadEnv(mode, backendDir, 'PORT');
  const backendPort = backendEnv.PORT || 4000;

  return {
    plugins: [react()],
    server: {
      // El frontend llama a /api/... y Vite lo reenvía al backend.
      // Así el navegador ve un solo origen y no hace falta configurar CORS.
      proxy: {
        '/api': {
          target: `http://localhost:${backendPort}`,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  };
});
