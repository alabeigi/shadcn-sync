import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { basename } from "node:path"

const shadcn = createRequire(import.meta.url).resolve("shadcn")

export function runShadcn(root: string, component: string, ...flags: string[]) {
  const result = spawnSync(process.execPath, [shadcn, "add", component, ...flags], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CI: "1", FORCE_COLOR: "0", NO_COLOR: "1" },
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "shadcn add failed.")
  }
  return result.stdout
}

export function inspectComponent(root: string, component: string) {
  const summary = runShadcn(root, component, "--dry-run")
  const output = runShadcn(root, component, "--view")
  const files = parseFiles(output)
  const expected = Number(summary.match(/^├ Files \((\d+)\)/m)?.[1] ?? 0)
  if (!expected || files.length !== expected) {
    throw new Error("shadcn did not preview all files. Use the official CLI for this item.")
  }
  const matches = files.filter((file) => [".tsx", ".jsx"].some(
    (extension) => basename(file.path) === component + extension,
  ))
  if (matches.length !== 1) {
    throw new Error("Expected one JSX component file with the same name as the registry item.")
  }
  const [target] = matches
  const related = files.filter((file) => file !== target)
  return {
    target,
    related,
    otherChanges: /^├ (CSS|Environment Variables|Fonts)$/m.test(summary),
    dependencies: [
      ...readList(summary, "Dependencies"),
      ...readList(summary, "Dev Dependencies"),
    ],
  }
}

export function parseFiles(output: string) {
  const lines = output.split(/\r?\n/)
  const files: { path: string; source: string }[] = []
  for (const [index, line] of lines.entries()) {
    const header = line.match(/^├ (.+) \((?:create|overwrite|skip)\) (\d+) lines$/)
    if (!header) continue
    const count = Number(header[2])
    const content = lines.slice(index + 2, index + 2 + count)
    if (
      !/^│ ┌─+$/.test(lines[index + 1] ?? "") ||
      content.length !== count ||
      !content.every((row) => row.startsWith("│ │ ")) ||
      !/^│ └─+$/.test(lines[index + 2 + count] ?? "")
    ) {
      throw new Error("Could not read the shadcn file preview.")
    }
    files.push({
      path: header[1].replaceAll("\\", "/"),
      source: content.map((row) => row.slice(4)).join("\n"),
    })
  }
  return files
}

function readList(output: string, title: string) {
  const lines = output.split(/\r?\n/)
  const index = lines.findIndex((line) => line.startsWith(`├ ${title} (`))
  if (index < 0) return []
  const count = Number(lines[index].match(/\((\d+)\)$/)?.[1])
  const items = lines.slice(index + 1, index + 1 + count)
  if (!count || items.length !== count || !items.every((line) => line.startsWith("│ + "))) {
    throw new Error(`Could not read the shadcn ${title.toLowerCase()} preview.`)
  }
  return items.map((line) => line.slice(4))
}

export function fingerprint(files: ReturnType<typeof inspectComponent>["related"]) {
  return files
    .map(({ path, source }) => `${path} ${createHash("sha256").update(source).digest("hex")}`)
    .sort()
}

export function missingDependencies(packagePath: string, requirements: string[]) {
  const manifest = JSON.parse(readFileSync(packagePath, "utf8"))
  const dependencies = { ...manifest.devDependencies, ...manifest.dependencies }
  return requirements.filter((requirement) => {
    const match = requirement.match(/^(@[^/@]+\/[^@]+|[^@/]+)(?:@(.+))?$/)
    if (!match || !Object.hasOwn(dependencies, match[1])) return true
    return Boolean(match[2] && dependencies[match[1]] !== match[2])
  })
}
