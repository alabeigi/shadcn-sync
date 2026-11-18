import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

function git(root: string, args: string[], maxStatus = 0) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status === null || result.status < 0 || result.status > maxStatus) {
    throw new Error(result.stderr.trim() || `git ${args[0]} failed.`)
  }
  return { text: result.stdout, status: result.status }
}

export function readFromCommit(root: string, revision: string, path: string) {
  const commit = git(root, ["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`])
  const prefix = git(root, ["rev-parse", "--show-prefix"]).text.trimEnd()
  return git(root, ["show", `${commit.text.trim()}:${prefix}${path}`]).text
}

export function merge(local: string, base: string, upstream: string) {
  return withTextFiles({ local, base, upstream }, (directory) => git(directory, [
    "merge-file", "-p", "--diff3",
    "-L", "local", "-L", "last installed", "-L", "shadcn upstream",
    "--", "local", "base", "upstream",
  ], 127))
}

export function diff(path: string, before: string, after: string) {
  return withTextFiles({ before, after }, (directory) => {
    const result = git(directory, ["diff", "--no-index", "--no-color", "--", "before", "after"], 1)
    return result.text
      .replace(/^diff --git a\/before b\/after$/m, () => `diff --git a/${path} b/${path}`)
      .replace(/^--- a\/before$/m, () => `--- a/${path}`)
      .replace(/^\+\+\+ b\/after$/m, () => `+++ b/${path}`)
  })
}

function withTextFiles<T>(contents: Record<string, string>, use: (directory: string) => T) {
  const directory = mkdtempSync(join(tmpdir(), "shadcn-sync-"))
  try {
    for (const [name, text] of Object.entries(contents)) writeFileSync(join(directory, name), text)
    return use(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
