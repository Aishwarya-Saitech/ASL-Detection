import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    headers: {
      // Required for MediaPipe Hands WASM + TFLite SharedArrayBuffer support
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },

  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },

  optimizeDeps: {
    // Exclude CDN-loaded packages from Vite's pre-bundling.
    // @mediapipe/hands, @tensorflow/tfjs and @tensorflow/tfjs-tflite are
    // all loaded via <script> tags from CDN at runtime.
    exclude: [
      '@mediapipe/hands',
      '@tensorflow/tfjs',
      '@tensorflow/tfjs-tflite',
      '@tensorflow/tfjs-backend-webgl',
    ],
  },
})

