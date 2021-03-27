---
id: variants
title: Variants
slug: /aspects/variants
---

The `teambit.workspace/variants` extension enables a cascading, CSS-like, selection of components in the workspace configuration. It provides order and simplicity to the way we apply rules and settings to large number of independent components - all in a single workspace.

Configurations set on a specific set of components will:

1. Affect only that selected set of components
2. Inherit policies set on a more general set of components (that includes the workspace default configs)
3. Override conflicting configurations inherited from more general component selections
4. Propagate configurations downwards to more specific sub-sets of components.

## Selecting components

### Selecting all components

To select all components in the workspace use the `*` wildcard. This is especially useful when configuring extensions that can only be used inside the `variants` field (for example, the different environments). For example:

```json
"teambit.workspace/variants": {
    "*": {
        "teambit.harmony/node": {}
    },
}
```

### Selecting using a directory path

To select using a directory path, use the relative path to the components' common directory. For example:

```json
"teambit.workspace/variants": {
    "components/utility-functions": {
        "teambit.harmony/node": {}
    },
}
```

### Selecting using a namespace

This option is recommended as it decouples your components' configurations from the workspace's file structure. It handles components using fundamental definitions that pertain to function and purpose. For example:

```json
"teambit.workspace/variants": {
    "{utility-functions/*}": {
        "teambit.harmony/node": {}
    },
}
```

### Selecting multiple sets of components

Multiple directory paths:

```json
"teambit.workspace/variants": {
    "components/utils,components/react-ui": {
        "teambit.harmony/node": {}
    },
}
```

Multiple namespaces:

```json
"teambit.workspace/variants": {
    "{utility-functions/*},{react-ui/*}": {
        "teambit.harmony/node": {}
    },
}
```

## Variants configurations

### propagate

Configurations set on one group of components are inherited by its sub-groups (in a CSS-like manner). For example, `components/react/ui` will inherit configurations from `components/react`. To prevent this from happening, set the `propogate` value of the parent group of components to `false`.

```json
"teambit.workspace/variants": {
    "components/react": {
        "propagate": false
        }
}
```

### maxSpecificity

Determines the number of levels to propagate configurations downwards. For example, the number of levels to go from `components/react` to `components/react/button` is 3.

```json
"teambit.workspace/variants": {
    "components/react": {
        "maxSpecificity": 3
        }
    },
    "components/react/button": {

    }
```

### exclude

Determines which components to exclude from a selected set.

```json
"teambit.workspace/variants": {
    "components/react": {
        "exclude": ["ui-primitives/button", "ui-primitives/app-bar"]
        }
    }
```

### defaultScope

Determines the default scope for the selected components:

```json
"teambit.workspace/variants": {
    "components/react": {
        "defaultScope": "my-org.react-app"
    }
}
```
