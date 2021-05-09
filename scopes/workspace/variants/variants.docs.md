---
id: variants
title: Variants
slug: /aspects/variants
---

`teambit.workspace/variants` enables a cascading, selection of directories/components in the workspace and apply configurations on them.
Configurations set on a specific set of components can:

1. Affect only that selected set of components
1. Inherit policies set on a more general set of components (that includes the workspace default configs)
1. Override conflicting configurations inherited from more general component selections
1. Propagate configurations downwards to more specific sub-sets of components

## Variatns Examples

### The Wildcard (\*) variant

To select all components in the workspace use a wildcard (`*`). This is useful when wanting to apply a very general rules on all components. For example:

```json
"teambit.workspace/variants": {
    "*": {
        "teambit.harmony/node": {}
    },
}
```

### Set rule with root directory

To select using a directory path, use the relative path to the components' common directory. For example:

```json
"teambit.workspace/variants": {
    "components/utility-functions": {
        "teambit.harmony/node": {}
    },
}
```

### Set rule with root namespace

This option is recommended as it decouples your components' configurations from the workspace's file structure. It handles components using fundamental definitions that pertain to function and purpose. For example:

```json
"teambit.workspace/variants": {
    "{utility-functions/*}": {
        "teambit.harmony/node": {}
    },
}
```

### Several rules in the same variant

You can set several rules for the same variant.

```json title="Multiple directory paths"
"teambit.workspace/variants": {
    "components/utils,components/react-ui": {
        "teambit.harmony/node": {}
    },
}
```

```json title="Multiple namespaces"
"teambit.workspace/variants": {
    "{utility-functions/*},{react-ui/*}": {
        "teambit.harmony/node": {}
    },
}
```

```json title="Paths and namespaces"
"teambit.workspace/variants": {
    "{utility-functions/*},{react-ui/*},components/utils,components/react-ui": {
        "teambit.harmony/node": {}
    },
}
```

### Exclude directories/components from a rule

Using the `!` you can exclude set of components from a specific rule.
The `!` works both for directories and namespaces for example:

#### Exclude directory from a rule

Apply `teambit.harmony/node` env on `utility-functions` but not on `utility-functions/react-utils`

```json title="workspace.json
"teambit.workspace/variants": {
    "components/utility-functions, !components/utility-functions/react-utils": {
        "teambit.harmony/node": {}
    },
}
```

#### Exclude namespace from a rule

Apply `teambit.harmony/node` env on every component under the utils namespace but not on utils/react components

```json title="workspace.json
"teambit.workspace/variants": {
    "{utils/*}, !{utils/react/*}": {
        "teambit.harmony/node": {}
    },
}
```

## Merging Configurations

The same component may have several rules applied to it. This works very much like CSS rules where the more specific variant "wins" when a Bit merges variant rules.

The following example shows how Bit does not apply `aspect1-components-key` nor the `aspect1-root-key`, as this was set by a more specific variant.

> Bit will merge into the final config aspects (with their configuration) which were part of the previous components' tag, unless they were explicitly removed (using the "remove" syntax below) or override by variants with new configuration.

```json title="workspace.json
{
  "teambit.workspace/variants": {
    "*": {
      "my-aspect1": {
        "aspect1-root-key": "aspect1-root-val"
      },
      "my-aspect2": {
        "aspect2-root-key": "aspect2-root-val"
      },
      "my-aspect4": {
        "aspect4-root-key": "aspect4-root-val"
      }
    },
    "components": {
      "my-aspect1": {
        "aspect1-components-key": "aspect1-components-val"
      },
      "my-aspect2": {
        "aspect2-components-key": "aspect2-components-val"
      }
    },
    "components/ui": {
      "my-aspect1": {
        "aspect1-components-ui-key": "aspect1-components-ui-val"
      },
      "my-aspect3": {
        "aspect3-components-ui-key": "aspect3-components-ui-val"
      }
    }
  }
}
```

```json title="components/ui/button's calculated configuration"
{
  "my-aspect1": {
    "aspect1-components-ui-key": "aspect1-components-ui-val"
  },
  "my-aspect2": {
    "aspect2-components-key": "aspect2-components-val"
  },
  "my-aspect3": {
    "aspect3-components-ui-key": "aspect3-components-ui-val"
  },
  "my-aspect4": {
    "aspect4-root-key": "aspect4-root-val"
  }
}
```

## Variants configurations

### propagate

Configurations set on one group of components are inherited by its sub-groups (in a CSS-like manner). For example, `components/react/ui` will inherit configurations from `components/react`.
To prevent this from happening, set the `propogate` value of a group of components to `false`.
Once bit see `"propagate": false` it takes the configuration for this group, and stop propagate.

```json title="workspace.json
"teambit.workspace/variants": {
  "components/react": {
    "my-aspect2": {
      "aspect2-react-key": "aspect2-react-val"
    }
  },
  "components/react/ui": {
    "propagate": false, // take this config, and stop propagate
    "my-aspect1": {
      "aspect1-react-ui-key": "aspect1-react-ui-val"
    }
  }
}
```

```json title="components/react/ui/button's calculated configuration"
{
  "my-aspect1": {
    "aspect1-react-ui-key": "aspect1-react-ui-val"
  }
}
```

## Removing aspects

In many cases you don't want a specific aspect to be define on a subgroup but you don't want to use the propagate false, since you want to get other configuration from parent group.
This can be achived using the `"-"` as a value for the aspect configuration.
This can also be used to remove aspect that

```json title="workspace.json
"teambit.workspace/variants": {
  "components/react": {
    "my-aspect2": {
      "aspect2-react-key": "aspect2-react-val"
    },
    "my-aspect3": {
      "aspect3-react-key": "aspect3-react-val"
    }
  },
  "components/react/ui": {
    "my-aspect1": {
      "aspect1-react-ui-key": "aspect1-react-ui-val"
    },
    "my-aspect2": "-" // Remove my-aspect2 from my configuration
  }
}
```

```json title="components/react/ui/button's calculated configuration"
{
  "my-aspect1": {
    "aspect1-react-ui-key": "aspect1-react-ui-val"
  },
  "my-aspect3": {
    "aspect3-react-key": "aspect3-react-val"
  }
}
```
