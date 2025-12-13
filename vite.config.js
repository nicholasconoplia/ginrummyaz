import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    // Use the root directory for index.html
    root: '.',

    // Public directory for static assets
    publicDir: 'public',

    // Build output
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html'),
            },
        },
    },

    // Dev server configuration
    server: {
        port: 5173,
        strictPort: true,
        // Proxy API requests to the backend server in development
        proxy: {
            '/socket.io': {
                target: 'http://localhost:3000',
                ws: true,
                changeOrigin: true,
            },
        },
    },

    // Resolve aliases
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
});
