import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Mirrors tsconfig.json's "paths": { "@/*": ["./src/*"] } -- Vitest doesn't read tsconfig
    // path mappings itself, so route.ts's "@/lib/..." imports resolve here, not through tsc.
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Vitest's forked worker pool is flaky on Windows under this Node version -- running many
    // test files concurrently causes sporadic 5s timeouts on otherwise-fast tests (worker
    // processes fail to tear down cleanly, seen as "EPERM" kill errors, and contend with
    // still-running siblings). Running files serially is slower but reliable; confirmed the
    // same 77 tests all pass every time this way, and were sporadically failing in parallel.
    fileParallelism: false,
  },
});
