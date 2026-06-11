import { defineConfig } from 'vite'
import { resolve } from 'path'

// Content script and service worker must be IIFE (no dynamic imports, single file)
// Popup and options pages can use ES modules via HTML entry

export default defineConfig(({ mode }) => {
  const isWorker = mode === 'worker'
  const isContent = mode === 'content'

  if (isWorker) {
    return {
      build: {
        rollupOptions: {
          input: resolve(__dirname, 'src/background/service-worker.js'),
          output: {
            entryFileNames: 'service-worker.js',
            dir: 'dist',
            format: 'iife',
            inlineDynamicImports: true,
          },
        },
        target: 'chrome112',
        minify: false,
        emptyOutDir: false,
      },
    }
  }

  if (isContent) {
    return {
      build: {
        rollupOptions: {
          input: resolve(__dirname, 'src/content/index.js'),
          output: {
            entryFileNames: 'content.js',
            dir: 'dist',
            format: 'iife',
            inlineDynamicImports: true,
          },
        },
        target: 'chrome112',
        minify: false,
        emptyOutDir: false,
      },
    }
  }

  // Default: popup + options HTML pages
  return {
    base: './',
    build: {
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'src/popup/popup.html'),
          options: resolve(__dirname, 'src/options/options.html'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
          dir: 'dist',
          format: 'es',
        },
      },
      target: 'chrome112',
      minify: false,
      emptyOutDir: true,
    },
  }
})
