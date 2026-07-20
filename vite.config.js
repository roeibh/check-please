import { defineConfig } from 'vite'

// GitHub project page lives at /check-please/. Override with BASE=/ for a user page.
export default defineConfig({
  base: process.env.BASE ?? '/check-please/',
  build: { target: 'es2020' },
})
