//! Expected output of comment-json 4.2.5 `stringify(parse(input), undefined, 2)` and of
//! a second pass over that output, recorded with the version Bit ships. Do not edit by hand.
pub(super) const CASES: &[(&str, &str, &str, Option<&str>)] = &[
    (
        "quirks",
        r#"/**
 * header
 **/
{
  "$schema": "x", // inline after value
  /* before b */
  "b" /* after prop */ : /* after colon */ 1.50,
  "c": [1, /* in array */ 2, // after two
    3,
  ],
  "d": {}, // after d
  "e": { /* lonely */ },
  "f": "a\u0001b\"c\\dé",
  "g": 1e3,
  "10": true,
  "2": null
  // trailing in obj
}
// after all
"#,
        r#"/**
 * header
 **/{
  "2": null,
  // trailing in obj
  "10": true,
  "$schema": "x", // inline after value
  /* before b */
  "b" /* after prop */: /* after colon */ 1.5,
  "c": [
    1, /* in array */
    2, // after two
    3
  ],
  "d": {}, // after d
  "e": { /* lonely */
  },
  "f": "ab\"c\\dé",
  "g": 1000
}
// after all"#,
        None,
    ),
    (
        "workspace",
        r#"/**
 * this is the main configuration file of your bit workspace.
 * for full documentation, please see: https://bit.dev/reference/workspace/workspace-json
 **/
{
  "$schema": "https://static.bit.dev/teambit/schemas/schema.json",
  /**
   * main configuration of the Bit workspace.
   **/
  "teambit.workspace/workspace": {
    /**
     * the name of the component workspace. used for development purposes.
     **/
    "name": "68621823",
    "defaultScope": "my-scope",
    "resolveAspectsFromNodeModules": true,
    "resolveEnvsFromRoots": true
  },
  "teambit.generator/generator": {
    "envs": [
      // "bitdev.node/node-env",
      // "bitdev.react/react-env",
      // "bitdev.vue/vue-env",
      // "bitdev.angular/angular-env"
      // "bitdev.symphony/envs/symphony-env"
    ]
  },
  /**
   * main configuration for component dependency resolution.
   **/
  "teambit.dependencies/dependency-resolver": {
    "policy": {
      "dependencies": {
        // this dependency must stay pinned
        "is-odd": "1.0.0"
      },
      "peerDependencies": {}
    },
    "linkCoreAspects": true,
    "packageManager": "teambit.dependencies/pnpm",
    "rootComponents": true,
    "engineStrict": true,
    // Some comments.
    "packageImportMethod": "copy"
  },
  "teambit.workspace/workspace-config-files": {
    "enableWorkspaceConfigWrite": true
  }
}
"#,
        r#"/**
 * this is the main configuration file of your bit workspace.
 * for full documentation, please see: https://bit.dev/reference/workspace/workspace-json
 **/{
  "$schema": "https://static.bit.dev/teambit/schemas/schema.json",
  /**
   * main configuration of the Bit workspace.
   **/
  "teambit.workspace/workspace": {
    /**
     * the name of the component workspace. used for development purposes.
     **/
    "name": "68621823",
    "defaultScope": "my-scope",
    "resolveAspectsFromNodeModules": true,
    "resolveEnvsFromRoots": true
  },
  "teambit.generator/generator": {
    "envs": [
      // "bitdev.node/node-env",
      // "bitdev.react/react-env",
      // "bitdev.vue/vue-env",
      // "bitdev.angular/angular-env"
      // "bitdev.symphony/envs/symphony-env"
    ]
  },
  /**
   * main configuration for component dependency resolution.
   **/
  "teambit.dependencies/dependency-resolver": {
    "policy": {
      "dependencies": {
        // this dependency must stay pinned
        "is-odd": "1.0.0"
      },
      "peerDependencies": {}
    },
    "linkCoreAspects": true,
    "packageManager": "teambit.dependencies/pnpm",
    "rootComponents": true,
    "engineStrict": true,
    // Some comments.
    "packageImportMethod": "copy"
  },
  "teambit.workspace/workspace-config-files": {
    "enableWorkspaceConfigWrite": true
  }
}"#,
        Some(
            r#"/**
 * this is the main configuration file of your bit workspace.
 * for full documentation, please see: https://bit.dev/reference/workspace/workspace-json
 **/{
  "$schema": "https://static.bit.dev/teambit/schemas/schema.json",
  /**
   * main configuration of the Bit workspace.
   **/
  "teambit.workspace/workspace": {
    /**
     * the name of the component workspace. used for development purposes.
     **/
    "name": "68621823",
    "defaultScope": "my-scope",
    "resolveAspectsFromNodeModules": true,
    "resolveEnvsFromRoots": true
  },
  "teambit.generator/generator": {
    "envs": [
      // "bitdev.node/node-env",
      // "bitdev.react/react-env",
      // "bitdev.vue/vue-env",
      // "bitdev.angular/angular-env"
      // "bitdev.symphony/envs/symphony-env"
    ]
  },
  /**
   * main configuration for component dependency resolution.
   **/
  "teambit.dependencies/dependency-resolver": {
    "policy": {
      "dependencies": {
        // this dependency must stay pinned
        "is-odd": "1.0.0"
      },
      "peerDependencies": {}
    },
    "linkCoreAspects": true,
    "packageManager": "teambit.dependencies/pnpm",
    "rootComponents": true,
    "engineStrict": true,
    // Some comments.
    "packageImportMethod": "copy"
  },
  "teambit.workspace/workspace-config-files": {
    "enableWorkspaceConfigWrite": true
  }
}"#,
        ),
    ),
    (
        "trailing_commas",
        r#"{
  "a": [
    1,
    2, // two
  ],
  "b": {
    "c": 1, // one
    // dangling
  },
}"#,
        r#"{
  "a": [
    1,
    2 // two
  ],
  "b": {
    "c": 1
    // dangling
  }
}"#,
        Some(
            r#"{
  "a": [
    1,
    2 // two
  ],
  "b": {
    "c": 1
    // dangling
  }
}"#,
        ),
    ),
    (
        "empty_with_comments",
        r#"{
  "a": [ // inside empty array
  ],
  "b": {
    // inside empty object
  },
  "c": [],
  "d": {}
}"#,
        r#"{
  "a": [ // inside empty array
  ],
  "b": {
    // inside empty object
  },
  "c": [],
  "d": {}
}"#,
        Some(
            r#"{
  "a": [ // inside empty array
  ],
  "b": {
    // inside empty object
  },
  "c": [],
  "d": {}
}"#,
        ),
    ),
    (
        "nested",
        r#"// leading line
// second line
{"x":{"y":[{"z":null},{"w":false}],"s":"tab\there\u00e9\u2028"},"n":-0.5,"big":12345678901234567890}
// trailing one
/* trailing two */"#,
        r#"// leading line
// second line
{
  "x": {
    "y": [
      {
        "z": null
      },
      {
        "w": false
      }
    ],
    "s": "tab\thereé "
  },
  "n": -0.5,
  "big": 12345678901234567000
}
// trailing one
/* trailing two */"#,
        None,
    ),
    (
        "crlf",
        r#"{
  // c1
  "a": 1, /* c2 */ // c3
  "b": 2
}
"#,
        r#"{
  // c1
  "a": 1, /* c2 */ // c3
  "b": 2
}"#,
        Some(
            r#"{
  // c1
  "a": 1, /* c2 */ // c3
  "b": 2
}"#,
        ),
    ),
    (
        "between",
        r#"{
  "a" // after prop line
  : 1,
  "b": /* before value */ "x" /* after value */ , /* after comma */
  /* own line */ "c": 3
}"#,
        r#"{
  "a" // after prop line
  : 1,
  "b": /* before value */ "x" /* after value */, /* after comma *//* own line */
  "c": 3
}"#,
        Some(
            r#"{
  "a" // after prop line
  : 1,
  "b": /* before value */ "x" /* after value */, /* after comma */ /* own line */
  "c": 3
}"#,
        ),
    ),
    (
        "root_array",
        r"[ /* start */ 1, 2 ] // end",
        r"[ /* start */
  1,
  2
] // end",
        Some(
            r"[ /* start */
  1,
  2
] // end",
        ),
    ),
];
pub(super) const POLICY_EDIT: &str = r#"/**
 * this is the main configuration file of your bit workspace.
 * for full documentation, please see: https://bit.dev/reference/workspace/workspace-json
 **/{
  "$schema": "https://static.bit.dev/teambit/schemas/schema.json",
  /**
   * main configuration of the Bit workspace.
   **/
  "teambit.workspace/workspace": {
    /**
     * the name of the component workspace. used for development purposes.
     **/
    "name": "68621823",
    "defaultScope": "my-scope",
    "resolveAspectsFromNodeModules": true,
    "resolveEnvsFromRoots": true
  },
  "teambit.generator/generator": {
    "envs": [
      // "bitdev.node/node-env",
      // "bitdev.react/react-env",
      // "bitdev.vue/vue-env",
      // "bitdev.angular/angular-env"
      // "bitdev.symphony/envs/symphony-env"
    ]
  },
  /**
   * main configuration for component dependency resolution.
   **/
  "teambit.dependencies/dependency-resolver": {
    "policy": {
      "dependencies": {
        // this dependency must stay pinned
        "is-odd": "1.0.0",
        "lodash": "^4.17.21"
      },
      "peerDependencies": {}
    },
    "linkCoreAspects": true,
    "packageManager": "teambit.dependencies/pnpm",
    "rootComponents": true,
    "engineStrict": true,
    // Some comments.
    "packageImportMethod": "copy"
  },
  "teambit.workspace/workspace-config-files": {
    "enableWorkspaceConfigWrite": true
  }
}"#;
pub(super) const READD_EDIT: &str = r#"/**
 * this is the main configuration file of your bit workspace.
 * for full documentation, please see: https://bit.dev/reference/workspace/workspace-json
 **/{
  "$schema": "https://static.bit.dev/teambit/schemas/schema.json",
  "teambit.generator/generator": {
    "envs": [
      // "bitdev.node/node-env",
      // "bitdev.react/react-env",
      // "bitdev.vue/vue-env",
      // "bitdev.angular/angular-env"
      // "bitdev.symphony/envs/symphony-env"
    ]
  },
  /**
   * main configuration for component dependency resolution.
   **/
  "teambit.dependencies/dependency-resolver": {
    "policy": {
      "dependencies": {
        // this dependency must stay pinned
        "is-odd": "1.0.0"
      },
      "peerDependencies": {}
    },
    "linkCoreAspects": true,
    "packageManager": "teambit.dependencies/pnpm",
    "rootComponents": true,
    "engineStrict": true,
    // Some comments.
    "packageImportMethod": "copy"
  },
  "teambit.workspace/workspace-config-files": {
    "enableWorkspaceConfigWrite": true
  },
  /**
   * main configuration of the Bit workspace.
   **/
  "teambit.workspace/workspace": {
    "name": "renamed"
  },
  "new-aspect": {
    "nested": {
      "list": [
        1,
        "two"
      ]
    }
  }
}"#;
