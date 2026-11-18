import assert from "node:assert/strict"
import test from "node:test"
import { parseFiles } from "../dist/registry.js"

test("reads an unchanged file preview without losing whitespace", () => {
  const preview = [
    "┌ shadcn add dialog (dry run)",
    "│",
    "├ src/ui/dialog.tsx (skip) 3 lines",
    "│ ┌────",
    '│ │   "use client"',
    "│ │ export {}",
    "│ │ ",
    "│ └────",
  ].join("\n")

  assert.deepEqual(parseFiles(preview), [
    { path: "src/ui/dialog.tsx", source: '  "use client"\nexport {}\n' },
  ])
})
