import {defineConfig, mergeConfig} from 'vitest/config'
import viteConfig from './vite.config.ts'

// The unit tests of the mutated pure-logic files (stryker.config.json `mutate`): component tests are slow and some (the
// time-zone ones) don't run under Stryker's runner
const pureLogicTests = [
    'src/features/dosing/{types,dosingText,taper}.test.ts',
    'src/features/prescription/{prescriptionText,usePrescriptionLines}.test.ts',
    'src/features/protocols/{editorItem,legacyRoutes}.test.ts',
    'src/features/roles/permissionChoice.test.ts',
    'src/api/{errors,dataScope}.test.ts',
    'src/app/chunkReload.test.tsx',
    'src/hooks/useSingleFlight.test.ts',
    'src/utils/clipboard.test.ts',
]

// The Vitest run of StrykerJS: the app's test set-up, without the tests that read files outside ClinicHub.Web (Stryker
// runs in a copy of this folder) and without coverage.
const config = mergeConfig(viteConfig, defineConfig({
    test: {
        exclude: ['src/i18n/locales/docMessages.test.ts', 'src/features/dosing/parity.test.ts'],
        sequence: {shuffle: false},
    },
}))

// mergeConfig concatenates arrays, so the include list is set afterwards to replace the app's
if (config.test) config.test.include = pureLogicTests

export default config
