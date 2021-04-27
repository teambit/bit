---
id: yarn
title: Yarn
slug: /aspects/yarn
description: Enables the use of Yarn 2 in a Bit workspace
labels: ['yarn', 'package manager']
---

Yarn is a Bit aspect that enables the use of the Yarn **v2** package manager in a Bit workspace (the Yarn aspect utilizes Yarn's programmatic API).
The yarn aspect is used **indirectly** by the 'Dependency Resolver'

## Quickstart

To start using the yarn aspect as a package manager for your workspace, set the Dependency Resolver `packageManager` property to 'yarn'.

```json
{
  "teambit.dependencies/dependency-resolver": {
    "packageManager": "teambit.dependencies/yarn"
  }
}
```

> Package manager are only configurable at the workspace configuration root-level.
> That means, different components in the same workspace cannot use different package manager.

---

> Packages on NPM will be installed from Bit.dev's registry instead of NPM's. This will be done using the user's Bit credentials.
