import assert from "node:assert/strict"
import test from "node:test"
import { diff, merge } from "../dist/git.js"

const base = "style: original\nline 2\nline 3\nline 4\nfocus: original\n"

test("applies an upstream fix while keeping a local style change", () => {
  const local = base.replace("style: original", "style: custom")
  const upstream = base.replace("focus: original", "focus: fixed")
  const result = merge(local, base, upstream)

  assert.equal(result.status, 0)
  assert.equal(result.text, local.replace("focus: original", "focus: fixed"))
  assert.match(diff("ui/dialog.tsx", local, result.text), /^\+focus: fixed$/m)
})

test("returns a conflict with the original and both proposed versions", () => {
  const local = base.replace("style: original", "style: custom")
  const upstream = base.replace("style: original", "style: new default")
  const result = merge(local, base, upstream)

  assert.equal(result.status, 1)
  assert.match(result.text, /<<<<<<< local\nstyle: custom\n\|{7} last installed\nstyle: original/)
  assert.match(result.text, /style: new default\n>>>>>>> shadcn upstream/)
})
