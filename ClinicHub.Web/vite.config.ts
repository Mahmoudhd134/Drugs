/// <reference types="vitest/config" />
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

/**
 * The pure-logic files (design M1.6 D3 "Frontend rules", plus the other pure modules with rules): each must reach the
 * D5 coverage gate on its own (lines ≥ 95%, branches ≥ 90%). StrykerJS mutates them (stryker.config.json `mutate`,
 * which also has features/drugGroups/editorItem.ts: tested, but 1 of its 8 branches is an unreachable `?? 0`).
 */
const PURE_LOGIC = [
    'src/features/dosing/types.ts',
    'src/features/dosing/dosingText.ts',
    'src/features/dosing/taper.ts',
    'src/features/prescription/prescriptionText.ts',
    'src/features/prescription/usePrescriptionLines.ts',
    'src/features/roles/permissionChoice.ts',
    'src/api/errors.ts',
    'src/api/dataScope.ts',
    'src/app/chunkReload.ts',
    'src/hooks/useSingleFlight.ts',
    'src/utils/clipboard.ts',
]

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
    // Vitest (unit + component tests next to the code: src/**/*.test.ts(x); helpers in src/test)
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.{ts,tsx}'],
        setupFiles: ['src/test/setup.ts'],
        // Node's own (empty) Web Storage would hide jsdom's localStorage/sessionStorage (Node ≥ 25 turns it on)
        execArgv: ['--no-experimental-webstorage'],
        // Tests must not depend on their order
        sequence: {shuffle: true},
        // Component tests drive MUI with real events: slow on a busy machine, never stuck
        testTimeout: 20_000,
        coverage: {
            provider: 'v8',
            reportsDirectory: '../artifacts/coverage/frontend',
            reporter: ['json-summary', 'html', 'text-summary'],
            include: ['src/**/*.{ts,tsx}'],
            exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/**/*.d.ts', 'src/main.tsx'],
            // One entry per file: a file pattern's thresholds apply to the files it matches
            thresholds: Object.fromEntries(PURE_LOGIC.map(file => [file, {lines: 95, branches: 90}])),
        },
    },
})
