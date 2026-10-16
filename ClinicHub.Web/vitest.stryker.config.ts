import {defineConfig, mergeConfig} from 'vitest/config'
import viteConfig from './vite.config.ts'

// The Vitest run of StrykerJS (stryker.config.json): the app's test set-up, without the tests that read files outside
// ClinicHub.Web (Stryker runs in a copy of this folder) and without coverage.
export default mergeConfig(viteConfig, defineConfig({
    test: {
        exclude: ['src/i18n/locales/docMessages.test.ts', 'src/features/dosing/parity.test.ts'],
        sequence: {shuffle: false},
    },
}))
