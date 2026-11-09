import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// https://vite.dev/config/
/*export default defineConfig({
  plugins: [react(), tailwindcss()],
})*/
export default defineConfig({
  plugins: [
    react({
      include: "**/*.{js,jsx,ts,tsx}", // <- para que también agarre .js con JSX
    }),
    tailwindcss(),
  ],
  esbuild: {
    jsx: "automatic", // <- fuerza el transform moderno
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setupTests.jsx",
    globals: true,
  },
});
