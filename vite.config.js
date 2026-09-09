import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    allowedHosts: ['.vercel.run'],
    proxy: {
      // Match the production image rewrite so WebGL textures stay same-origin.
      '/img/': {
        target: 'https://source.roboflow.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/img\//, '/'),
      },
    },
  },
})
