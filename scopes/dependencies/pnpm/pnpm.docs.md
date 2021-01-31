---
description: Enables the use of pnpm in a Bit workspace
labels: ['pnpm', 'package manager']
---

pnpm is a Bit aspect that enables the use of the pnpm package manager in a Bit workspace.  
The pnpn aspect is used **indirectly** by the [Dependency Resolver](https://bit.dev/dependencies/pnpm).

## Quickstart

To start using the pnpm aspect as a package manager for your workspace, set the Dependency Resolver `packageManager` property to 'pnpm'.

```json
{
  "teambit.dependencies/dependency-resolver": {
    "packageManager": "teambit.dependencies/pnpm"
  }
}
```

> Package manager are only configurable at th workspace configuration root-level.
> That means, different components in the same workspace cannot use different package manager.

---

> Packages on NPM will be installed from Bit.dev's registry instead of NPM's. This will be done using the user's Bit credentials.

> The pnpm aspect uses Bit's deduping algorithm - not pnpm's.

> pnpm cannot be used with the [React Native environment](https://bit.dev/teambit/react/react-native).
