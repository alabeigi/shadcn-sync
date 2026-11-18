# shadcn-sync

Update a customized shadcn/ui component with a three-way Git merge.

Run the commands from an initialized shadcn project. Requires Node.js 20.18.1 or newer and Git.

```sh
npx shadcn-sync add dialog
npx shadcn-sync update dialog --dry-run
npx shadcn-sync update dialog
```

`add` calls the official shadcn CLI and records the original component in `.shadcn-sync/`. Commit that directory with your project. `update` merges the saved source, your current file, and the latest source generated for your project's shadcn settings. A conflict exits with status 1 and prints the conflicted merge for review.

To track a component you already customized, pass the Git commit containing the untouched installation, including any component files installed alongside it.

```sh
npx shadcn-sync track dialog --from <install-commit>
```

This release tracks one same-named JSX or TSX file per official registry item. If an upstream change also requires changes to other generated files, review the update with `npx shadcn add dialog --dry-run`. Dependencies required by an update must already be declared in the project.

## Development

```sh
npm ci
npm test
npm pack --dry-run
```
