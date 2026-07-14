import { randomBytes } from "node:crypto"
import { chmod, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const examplePath = path.join(rootDirectory, ".env.example")
const outputPath = path.join(rootDirectory, ".env")

const help = `Usage: pnpm env:generate [--force | --stdout]

Generate secure local credentials from .env.example.

Options:
  --force   Replace an existing .env file
  --stdout  Print the generated file without writing it
  --help    Show this help
`

const args = new Set(process.argv.slice(2))
const knownArgs = new Set(["--force", "--stdout", "--help", "-h"])
const unknownArgs = [...args].filter((arg) => !knownArgs.has(arg))

if (unknownArgs.length > 0) {
  console.error(`Unknown option: ${unknownArgs.join(", ")}`)
  console.error(help)
  process.exit(1)
}

if (args.has("--help") || args.has("-h")) {
  console.log(help)
  process.exit(0)
}

if (args.has("--force") && args.has("--stdout")) {
  console.error("--force and --stdout cannot be used together.")
  process.exit(1)
}

const hex = (bytes: number) => randomBytes(bytes).toString("hex")
const accessKey = () => randomBytes(10).toString("hex")

const generators: Record<string, () => string> = {
  AUTH_TOKEN: () => hex(32),
  POSTGRES_PASSWORD: () => hex(24),
  RUSTFS_ACCESS_KEY: accessKey,
  RUSTFS_SECRET_KEY: () => hex(32),
  RUSTFS_SERVER_ACCESS_KEY: accessKey,
  RUSTFS_SERVER_SECRET_KEY: () => hex(32),
}

const example = await readFile(examplePath, "utf8")
const generatedKeys = new Set<string>()
const content = example.replace(/^([A-Z][A-Z0-9_]*)=.*$/gm, (_line, key: string) => {
  const generate = generators[key]
  if (!generate) {
    throw new Error(`No generator is configured for ${key} in .env.example.`)
  }

  generatedKeys.add(key)
  return `${key}=${generate()}`
})

const missingKeys = Object.keys(generators).filter((key) => !generatedKeys.has(key))
if (missingKeys.length > 0) {
  throw new Error(`Missing variables in .env.example: ${missingKeys.join(", ")}`)
}

if (args.has("--stdout")) {
  process.stdout.write(content)
  process.exit(0)
}

try {
  await writeFile(outputPath, content, {
    encoding: "utf8",
    flag: args.has("--force") ? "w" : "wx",
    mode: 0o600,
  })
  await chmod(outputPath, 0o600)
  console.log(`Created ${path.relative(process.cwd(), outputPath) || ".env"} with secure random credentials.`)
  console.log("Keep this file private. Use AUTH_TOKEN when connecting clients to the sync server.")
} catch (error) {
  if (error instanceof Error && "code" in error && error.code === "EEXIST") {
    console.error(".env already exists; left it unchanged. Use --force to replace it.")
    process.exit(1)
  }
  throw error
}
