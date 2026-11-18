#!/usr/bin/env node
import { randomUUID } from "node:crypto"
import {
  existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { parseArgs } from "node:util"
import { diff, merge, readFromCommit } from "./git.js"
import { fingerprint, inspectComponent, missingDependencies, runShadcn } from "./registry.js"

const help = `Usage:
  shadcn-sync add <component>
  shadcn-sync track <component> --from <commit>
  shadcn-sync update <component> [--dry-run]

Run from the directory containing components.json.`

type Pending = { before: string; merged: string; upstream: string }
type Snapshot = { path: string; source: string; related: string[]; pending?: Pending }

function main(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      "dry-run": { type: "boolean" },
      from: { type: "string" },
    },
  })
  const [command, component, extra] = positionals
  if (values.help || !args.length) {
    console.log(help)
    return
  }
  if (
    !["add", "track", "update"].includes(command) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(component ?? "") ||
    extra ||
    (values["dry-run"] && command !== "update") ||
    (Boolean(values.from) !== (command === "track"))
  ) {
    throw new Error(help)
  }

  const root = process.cwd()
  if (!existsSync(join(root, "components.json")) || !existsSync(join(root, "package.json"))) {
    throw new Error("Run from an initialized shadcn project with components.json and package.json.")
  }
  const state = projectPath(root, `.shadcn-sync/${component}.json`)
  if (values["dry-run"]) {
    update(root, state, component, true)
    return
  }

  const stateDir = dirname(state)
  mkdirSync(stateDir, { recursive: true })
  const lock = join(stateDir, ".lock")
  try {
    writeFileSync(lock, `${process.pid}\n`, { flag: "wx" })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    throw new Error("Another shadcn-sync run holds .shadcn-sync/.lock. If it exited, remove the lock and retry.")
  }
  try {
    if (command === "update") {
      update(root, state, component, false)
    } else {
      track(root, state, component, values.from)
    }
  } finally {
    rmSync(lock, { force: true })
  }
}

function track(root: string, state: string, component: string, from?: string) {
  if (existsSync(state)) throw new Error(`${component} is already tracked. Use update.`)
  const { target, related } = inspectComponent(root, component)
  const file = projectPath(root, target.path)
  for (const item of related) projectPath(root, item.path)

  if (from) {
    if (!existsSync(file)) throw new Error(`Missing local file: ${target.path}`)
    save(state, {
      path: target.path,
      source: readFromCommit(root, from, target.path),
      related: fingerprint(related.map(({ path }) => ({ path, source: readFromCommit(root, from, path) }))),
    })
  } else {
    if (existsSync(file)) {
      throw new Error(`${target.path} already exists. Use track --from with the original install commit.`)
    }
    process.stdout.write(runShadcn(root, component, "--yes"))
    const installed = readFileSync(file, "utf8")
    if (installed !== target.source) {
      throw new Error("Installed source differed from the preview. Commit the original source and use track --from.")
    }
    save(state, { path: target.path, source: installed, related: fingerprint(related) })
  }
  console.log(`Tracked ${target.path}. Commit .shadcn-sync/${component}.json with your project.`)
}

function update(root: string, state: string, component: string, dryRun: boolean) {
  if (!existsSync(state)) {
    throw new Error(`No baseline for ${component}. Use add or track --from <commit>.`)
  }
  const snapshot: Snapshot = JSON.parse(readFileSync(state, "utf8"))
  if (![component + ".tsx", component + ".jsx"].includes(basename(snapshot.path))) {
    throw new Error(`Invalid component path in the tracked snapshot: ${snapshot.path}`)
  }
  const file = projectPath(root, snapshot.path)
  const local = readFileSync(file, "utf8")
  if (snapshot.pending) {
    finishUpdate(state, file, snapshot, snapshot.pending, dryRun)
    return
  }

  const { target, related, otherChanges, dependencies } = inspectComponent(root, component)
  if (target.path !== snapshot.path) {
    throw new Error(`Component path changed from ${snapshot.path} to ${target.path}. Review the shadcn preview.`)
  }
  if (target.source === snapshot.source) {
    console.log(`${target.path} is up to date.`)
    return
  }
  const missing = missingDependencies(join(root, "package.json"), dependencies)
  if (missing.length) throw new Error(`Review and install required dependencies: ${missing.join(", ")}.`)
  if (
    otherChanges ||
    related.some(({ path }) => !existsSync(projectPath(root, path))) ||
    JSON.stringify(fingerprint(related)) !== JSON.stringify(snapshot.related)
  ) {
    throw new Error("The upstream update also affects other project files. Review it with shadcn add --dry-run.")
  }

  const result = merge(local, snapshot.source, target.source)
  if (result.status > 0) {
    console.error(`Conflict in ${target.path}. Review the merge below. No project files were changed.`)
    process.stdout.write(result.text)
    process.exitCode = 1
    return
  }

  const pending = { before: local, merged: result.text, upstream: target.source }
  finishUpdate(state, file, snapshot, pending, dryRun)
}

function finishUpdate(state: string, file: string, snapshot: Snapshot, pending: Pending, dryRun: boolean) {
  const current = readFileSync(file, "utf8")
  if (current !== pending.before && (!snapshot.pending || current !== pending.merged)) {
    throw new Error(`${snapshot.path} changed during an update. Review the file and tracked snapshot before retrying.`)
  }
  if (dryRun) {
    const patch = diff(snapshot.path, current, pending.merged)
    console.log(patch.trimEnd() || `${snapshot.path} already contains the upstream changes.`)
    return
  }

  // Keep enough information to finish the update if the process stops between the two writes.
  if (!snapshot.pending) save(state, { ...snapshot, pending })
  if (current !== pending.merged) writeAtomic(file, pending.merged)
  save(state, { path: snapshot.path, source: pending.upstream, related: snapshot.related })
  console.log(`Updated ${snapshot.path}.`)
}

function projectPath(root: string, path: string) {
  const absolute = resolve(root, path)
  const relativePath = relative(root, absolute)
  const segments = relativePath.split(sep)
  if (!relativePath || isAbsolute(relativePath) || segments[0] === ".." || segments.includes(".git")) {
    throw new Error(`Invalid project path: ${path}`)
  }
  let parent = absolute
  while (parent !== root) {
    try {
      if (lstatSync(parent).isSymbolicLink()) throw new Error(`Unsupported symlink: ${relative(root, parent)}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    parent = dirname(parent)
  }
  return absolute
}

function save(path: string, snapshot: Snapshot) {
  writeAtomic(path, `${JSON.stringify(snapshot, null, 2)}\n`)
}

function writeAtomic(path: string, content: string) {
  const temporary = `${path}.${randomUUID()}.tmp`
  const mode = existsSync(path) ? lstatSync(path).mode & 0o777 : 0o666
  try {
    writeFileSync(temporary, content, { flag: "wx", mode })
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}

try {
  main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
