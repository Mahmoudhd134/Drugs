import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
    build: {
        outDir: '../ClinicHub.Api/wwwroot',
        emptyOutDir: true,
    },
    plugins: [
        react(),
        tailwindcss(),
    ],
    server: {
        // Same origin as the SPA in development, so the refresh cookie (SameSite=Strict) is sent
        proxy: {
            '/api': 'http://localhost:5000',
        },
    },
})
