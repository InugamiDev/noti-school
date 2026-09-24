import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
export default defineConfig({ plugins: [solid()], server: { port: 3000, strictPort: true, proxy: { '/api/auth': 'http://127.0.0.1:3811', '/api': 'http://127.0.0.1:3810' } }, build: { target: 'es2022' } });
