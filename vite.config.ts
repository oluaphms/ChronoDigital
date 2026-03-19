import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const projectRoot = path.resolve(__dirname);

// Garantir uma única instância de React: forçar resolução sempre para o mesmo path (evita useState of null)
const reactAlias = {
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-dom': path.resolve(projectRoot, 'node_modules/react-dom'),
  'react-dom/client': path.resolve(projectRoot, 'node_modules/react-dom/client'),
  'react/jsx-runtime': path.resolve(projectRoot, 'node_modules/react/jsx-runtime.js'),
  'react/jsx-dev-runtime': path.resolve(projectRoot, 'node_modules/react/jsx-dev-runtime.js'),
};

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
        ...reactAlias,
        // victory-vendor: pacote não inclui ./es/d3-*.js no npm
        'victory-vendor/d3-shape': path.resolve(projectRoot, 'node_modules/d3-shape'),
        'victory-vendor/d3-scale': path.resolve(projectRoot, 'node_modules/d3-scale'),
      },
      dedupe: ['react', 'react-dom'],
    },

    optimizeDeps: {
      // Só pre-bundlar React: libs que usam React ficam de fora e importam o mesmo react (evita useState of null)
      // es-toolkit NÃO deve estar em include: o pacote usa named exports; pre-bundlar quebra "does not provide an export named 'default'"
      include: ['react', 'react-dom', 'scheduler', 'cookie', 'set-cookie-parser'],
      exclude: ['recharts', 'lucide-react', 'framer-motion', 'react-router-dom'],
      esbuildOptions: {
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
            // Uma única instância de React: colocar react/react-dom/scheduler no mesmo chunk
            // para evitar "Cannot read properties of null (reading 'useState')"
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/scheduler/')) {
              return 'react-vendor'
            }
            if (id.includes('node_modules/@supabase/supabase-js')) return 'supabase-vendor'
            if (id.includes('node_modules/lucide-react') || id.includes('node_modules/recharts')) return 'ui-vendor'
            return undefined
          }
        }
      }
    }
  }
});          