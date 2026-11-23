# shadcn-sync

Update customized shadcn/ui components with a three-way Git merge. The CLI merges your local edits with the latest registry version using the original component as the merge base.

## Quick start

Run these commands from an initialized shadcn/ui project. You'll need Git and Node.js 20.18.1 or newer. `npx` runs the CLI without a global install.

```sh
npx shadcn-sync add dialog
npx shadcn-sync update dialog --dry-run
npx shadcn-sync update dialog
```

1. `add` installs the component with the official shadcn CLI and saves the original in `.shadcn-sync/`. Commit that directory with your project.
2. Customize the component in your project. Run `update --dry-run` to preview the merge.
3. Run `update` to apply the merge. If Git finds a conflict, the CLI prints the conflicted merge and exits with status 1.

## Track an existing component

If you've already customized a component, use the Git commit that contains the untouched installation and its companion files:

```sh
npx shadcn-sync track dialog --from <install-commit>
```

Commit the resulting `.shadcn-sync/` directory, then use the same update commands as above.

## Scope

Each tracked official registry item covers one same-named JSX or TSX file. If an upstream update also changes companion files, review them with `npx shadcn add dialog --dry-run`. Your project must already declare any dependencies needed by the updated component.

## Development

```sh
npm ci
npm test
npm pack --dry-run
```

## License

MIT. See [LICENSE](https://github.com/alabeigi/shadcn-sync/blob/main/LICENSE).
