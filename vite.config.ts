import tailwindcss from "@tailwindcss/vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"
import path from "node:path"
import topLevelAwait from "vite-plugin-top-level-await"
import wasm from "vite-plugin-wasm"
import { defineConfig } from "vite"
import { execSync } from "node:child_process"
import IstanbulPlugin from "./tooling/vite-plugin-istanbul/index"
import { commonFilesPlugin } from "./tooling/vite-plugin-common-files"
import { unusedFilesPlugin } from "./tooling/vite-plugin-detect-unused-files/detect-unused-files"

function getGitCommitHash() {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim()
  } catch {
    return "unknown"
  }
}

const base = process.env.USE_RELATIVE_BASE === "true" ? "./" : "/"
const tauriDevHost = process.env.TAURI_DEV_HOST
const tauriDevPort = Number(process.env.TAURI_DEV_PORT ?? 4000)
const coverageEnabled = process.env.VITE_COVERAGE === "true"
const sourceMapEnabled = coverageEnabled || process.env.VITE_SOURCEMAP === "true"

export default defineConfig({
  base,
  server: tauriDevHost
    ? {
        hmr: {
          protocol: "ws",
          host: tauriDevHost,
          clientPort: tauriDevPort,
        },
      }
    : undefined,
  define: {
    __PROJECT_COMMIT_HASH__: JSON.stringify(getGitCommitHash()),
  },
  build: {
    target: "esnext",
    // Source maps are useful for coverage, but shipping them in frontendDist
    // needlessly increases the desktop/mobile bundles and exposes source code.
    sourcemap: sourceMapEnabled,
    // The remaining entry chunks are about 108 KiB gzipped; 700 KiB avoids
    // warning on those while still catching meaningful bundle regressions.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "vendor-react",
              test: /node_modules[\\/].pnpm[\\/](?:react|react-dom|scheduler)@/,
              priority: 30,
            },
            {
              name: "vendor-parser",
              test: /node_modules[\\/].pnpm[\\/](?:acorn|acorn-jsx|espree|eslint-visitor-keys)@/,
              priority: 20,
            },
            {
              name: "vendor-aws",
              test: /node_modules[\\/].pnpm[\\/](?:@aws-sdk|@smithy)\+/,
              priority: 20,
            },
            {
              name: "vendor-loro",
              test: /node_modules[\\/].pnpm[\\/]loro-crdt@/,
              priority: 20,
            },
            {
              name: "vendor-foundation",
              test: /node_modules[\\/].pnpm[\\/]@hamsterbase\+foundation@/,
              priority: 20,
            },
            {
              name: "vendor-dnd",
              test: /node_modules[\\/].pnpm[\\/]@dnd-kit\+/,
              priority: 20,
            },
            {
              name: "vendor-zod",
              test: /node_modules[\\/].pnpm[\\/]zod@/,
              priority: 20,
            },
            {
              name: "vendor-icons",
              test: /node_modules[\\/].pnpm[\\/]lucide-react@/,
              priority: 20,
            },
            {
              name: "vendor-ai-markdown",
              test: /node_modules[\\/].pnpm[\\/](?:openai|react-markdown|remark-|rehype-|micromark|mdast-|hast-|unified@|unist-)@/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.join(import.meta.dirname, "./src"),
    },
  },

  plugins: [
    tailwindcss(),
    topLevelAwait({
      promiseExportName: "__tla",
      promiseImportName: (i) => `__tla_${i}`,
    }),
    react(),
    process.env.REACT_COMPILER !== "false" &&
      babel({
        presets: [reactCompilerPreset()],
        plugins: [["@babel/plugin-syntax-decorators", { legacy: true }]],
      }),
    wasm(),
    coverageEnabled &&
      IstanbulPlugin({
        enabled: true,
        exclude: ["**/node_modules/**"],
        include: ["**/*.ts", "**/*.tsx"],
      }),
    process.env.CHECK_UNUSED !== "false" &&
      unusedFilesPlugin({
        exclude: [
          "src/cli/**",
          "src/core/time/getTimeStampFromDateStr.ts",
          "src/core/time/isStartOfDay.ts",
          "**/*.d.ts",
          "**/*.test.ts",
        ],
      }),
    commonFilesPlugin({
      entries: ["src/desktop/main.tsx", "src/mobile/main.tsx"],
      exclude: [
        "src/nls.ts",
        "src/core/**",
        "src/services/**/*.ts",
        "src/ui/**",
        "src/plugins/**",
        "src/locales/**",
        "src/testIds.ts",
      ],
      validate: (files) => {
        console.log("\n┌─────────────────────────────────────────────────┐")
        console.log(`│ Common files between desktop and mobile: ${String(files.length).padEnd(5)} │`)
        console.log("└─────────────────────────────────────────────────┘")
        if (files.length > 0) {
          files.forEach((file, index) => {
            const prefix = index === files.length - 1 ? "└──" : "├──"
            console.log(`${prefix} ${file}`)
          })
          console.log("")
          throw new Error("Found common files between desktop and mobile!")
        }
      },
    }),
  ],
})
