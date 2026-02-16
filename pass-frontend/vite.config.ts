import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { viteStaticCopy } from 'vite-plugin-static-copy' // <-- Adicionado

export default defineConfig({
  plugins: [
    react(),
    // Adicionado: Copia os arquivos que o navegador não está achando
    viteStaticCopy({
      targets: [
        { src: 'node_modules/@noir-lang/noirc_abi/web/*.wasm', dest: '.' },
        { src: 'node_modules/@noir-lang/acvm_js/web/*.wasm', dest: '.' }
      ]
    })
  ],
  envDir: '..',
  define: {
    global: 'globalThis'
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      buffer: path.resolve(__dirname, './node_modules/buffer/')
    },
    dedupe: ['@stellar/stellar-sdk']
  },
  optimizeDeps: {
    // Adicionado '@noir-lang/noir_js' ao exclude para evitar conflitos de bundle
    exclude: ['@noir-lang/backend_barretenberg', '@aztec/bb.js', '@noir-lang/noir_js'],
    include: ['@stellar/stellar-sdk', '@stellar/stellar-sdk/contract', '@stellar/stellar-sdk/rpc', 'buffer'],
    esbuildOptions: {
      target: 'esnext', // <-- Adicionado para suportar BigInt do Noir
      define: {
        global: 'globalThis'
      }
    }
  },
  build: {
    target: 'esnext', // <-- Adicionado para garantir suporte no build
    commonjsOptions: {
      transformMixedEsModules: true
    }
  },
  server: {
    port: 3000,
    open: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    }
  }
})