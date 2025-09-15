Instructions to publish `@teambit/legacy` package.

This is needed for backward compatibility. Some older components still have import statements from "@teambit/legacy/dist...". Whenever possible, remove them. Legacy has moved to components/aspects you can use directly.

Steps to publish this package:

1. run `git checkout publish-teambit-legacy`
2. recommended: `git merge master`
3. bump the version in the package.json file.
4. run `npm publish` (make sure your local .npmrc doesn't have the @teambit registry temporarily for this command)
5. commit and push the changes back to the remote.

Once the package is published, update master with the new version in two places: in workspace.jsonc (inside the variants) and by running `bit deps set teambit.harmony/bit @teambit/legacy@x.x.x`.
