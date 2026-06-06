import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Se o repo se chamar "nexusos", o base precisa ser "/nexusos/"
// Se for um repositório com Pages em domínio próprio ou repo raiz, use "/"
// Ajuste VITE_BASE_PATH no secret ou deixe "/" para repo raiz
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? '/',
})
