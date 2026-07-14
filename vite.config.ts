import tailwindcss from "@tailwindcss/vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"
import path from "node:path"
import wasm from "vite-plugin-wasm"
import { nodePolyfills } from "vite-plugin-node-polyfills"
import { defineConfig, type Plugin } from "vite"
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
const tauriPlatform = process.env.TAURI_ENV_PLATFORM
const tauriBuildFamily = tauriPlatform
  ? ["android", "androideabi", "ios"].includes(tauriPlatform)
    ? "mobile"
    : "desktop"
  : "web"

function tauriPlatformEntryPlugin(): Plugin | false {
  if (tauriBuildFamily === "web") return false

  return {
    name: "tauri-platform-entry",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html.replace("/src/main.tsx", `/src/main.${tauriBuildFamily}.tsx`)
      },
    },
  }
}

export default defineConfig({
  base,
  worker: {
    format: "es",
  },
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
    manifest: true,
    // Source maps are useful for coverage, but shipping them in frontendDist
    // needlessly increases the desktop/mobile bundles and exposes source code.
    sourcemap: sourceMapEnabled,
    // Route-level lazy loading keeps every JavaScript chunk below this limit.
    // CI separately enforces the same 350 KiB budget on the uncompressed files.
    chunkSizeWarningLimit: 350,
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
    alias: [
      { find: "@", replacement: path.join(import.meta.dirname, "./src") },
      // The package's browser condition uses synchronous XMLHttpRequest for
      // WASM, which cannot be fulfilled by a Service Worker while offline.
      // The bundler entry uses native module/TLA loading and is cacheable.
      { find: /^loro-crdt$/, replacement: "loro-crdt/bundler" },
    ],
  },

  plugins: [
    tauriPlatformEntryPlugin(),
    nodePolyfills({
      include: ["process", "util"],
      globals: { process: true },
    }),
    tailwindcss(),
    react(),
    process.env.REACT_COMPILER !== "false" &&
      babel({
        sourceMap: sourceMapEnabled,
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
      tauriBuildFamily === "web" &&
      unusedFilesPlugin({
        exclude: [
          "src/main.desktop.tsx",
          "src/main.mobile.tsx",
          "src/cli/**",
          "src/core/time/getTimeStampFromDateStr.ts",
          "src/core/time/isStartOfDay.ts",
          "**/*.d.ts",
          "**/*.test.ts",
          "**/*.worker.ts",
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
