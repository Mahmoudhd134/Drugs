import {fileURLToPath} from "node:url";
import {defineConfig} from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

/**
 * The attachments harness page's own build (`npm run build:harness`; design attachments § 12), outside the production
 * build: global setup copies it into the run's own copy of the web root, so the run's API serves it, same origin, at
 * `/__harness/attachments/`. Never into ClinicHub.Api/wwwroot (ATT-255).
 */
export default defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),
    base: "/__harness/attachments/",
    publicDir: false,
    plugins: [react(), tailwindcss()],
    build: {
        outDir: fileURLToPath(new URL("../../../dist-harness/attachments", import.meta.url)),
        emptyOutDir: true,
    },
});
