import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const projectRoot = path.resolve(__dirname)

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'

  return {
    base: '/',

    plugins: [
      react(),

      {
        name: 'remove-tailwind-cdn',
        transformIndexHtml(html: string) {
          if (isProduction) {
            return html.replace(
              /<script[^>]*src=["']https?:\/\/cdn\.tailwindcss\.com[^"']*["'][^>]*><\/script>/gi,
              ''
            )
          }
          return html
        }
      }
    ],

    server: {
      port: 3010,
      strictPort: false,
      host: true,
      open: true
    },

    esbuild: {
      logOverride: { 'this-is-undefined-in-esm': 'silent' }
    },

    define: {
      'process.env.API_KEY': JSON.stringify(process.env.VITE_GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(process.env.VITE_GEMINI_API_KEY)
    },

    resolve: {
      alias: {
        '@': projectRoot,
        // Garante que todas as importações usem a MESMA instância de React (evita "useState of null")
        react: path.resolve(projectRoot, 'node_modules/react'),
        'react-dom': path.resolve(projectRoot, 'node_modules/react-dom'),
        'react-dom/client': path.resolve(projectRoot, 'node_modules/react-dom/client'),
        'react-is': path.resolve(projectRoot, 'node_modules/react-is'),
      },
      dedupe: ['react', 'react-dom', 'react-dom/client', 'react-is']
    },

    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client', 'react-is', 'recharts', 'lucide-react', 'framer-motion', 'react-router-dom'],
      esbuildOptions: {
        // Garante um único bundle de React na pré-bundlagem
        mainFields: ['module', 'main'],
      },
    },

    publicDir: 'public',

    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './vitest.setup.ts',
      include: ['**/*.test.{ts,tsx}']
    },

    build: {
      outDir: 'dist',
      sourcemap: false,
      emptyOutDir: true,
      minify: 'esbuild',
      cssCodeSplit: true,
      cssMinify: true,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Evita chunk separado de React para prevenir "useState of null" (múltiplas instâncias)
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return undefined
            if (id.includes('node_modules/@supabase/supabase-js')) return 'supabase-vendor'
            if (id.includes('node_modules/lucide-react') || id.includes('node_modules/recharts')) return 'ui-vendor'
            return undefined
          }
        }
      }
    }
  }
})          