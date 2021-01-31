---
description: Enables the use of Yarn 2 in a Bit workspace
labels: ['pnpm', 'package manager']
---

Yarn is a Bit aspect that enables the use of the Yarn v2 package manager in a Bit workspace.  
The yarn aspect is used **indirectly** by the [Dependency Resolver](https://bit.dev/dependencies/pnpm).

## Quickstart

To start using the yarn aspect as a package manager for your workspace, set the Dependency Resolver `packageManager` property to 'yarn'.

```json
{
  "teambit.dependencies/dependency-resolver": {
    "packageManager": "teambit.dependencies/yarn"
  }
}
```

> Package manager are only configurable at th workspace configuration root-level.
> That means, different components in the same workspace cannot use different package manager.

---

> Packages on NPM will be installed from Bit.dev's registry instead of NPM's. This will be done using the user's Bit credentials.
