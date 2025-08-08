import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/thungstory/',   // ✅ 레포명과 일치
  build: { outDir: 'docs' } // ✅ 빌드 산출물을 docs/로
});