import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isProd = process.env.NODE_ENV === 'production'

// CHANGE repo name if different:
const repoBase = '/BUSDIV-Awards-Dashboard/'

export default defineConfig({
  plugins: [react()],
  base: isProd ? repoBase : '/', // root in dev; subpath in prod
})