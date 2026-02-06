import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { lingoCompilerPlugin } from '@lingo.dev/compiler/vite'

export default defineConfig({
  plugins: [
    lingoCompilerPlugin({
      sourceRoot: "src",
      sourceLocale: "en",
      targetLocales: ["hi", "es"], 
      useDirective: true, 
    }),
    react()
  ],
  optimizeDeps: {
    // This tells Vite to pre-bundle these specifically 
    // and resolves the y-monaco import issue automatically.
    include: [
      'y-monaco',
      'yjs',
      'y-websocket',
      'monaco-editor/esm/vs/editor/editor.api'
    ]
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
})