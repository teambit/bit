//! Port of `e2e/harmony/debug-load.e2e.ts` for native `bit debug-load` parity ([`debug_load_command_human_json_and_unknown_component`]).
//!
//! Verifies human-readable and `--json` trace output, extension source attribution, and unknown-component error handling.

use crate::helper::Helper;
use serde_json::{Value, json};

/// Built-in React environment aspect ID assigned to `comp1` in `bit debug-load` tests.
const REACT_ENV: &str = "teambit.react/react";

/// Verifies human and `--json` output of `bit debug-load` with [`REACT_ENV`] as well as unknown-component error reporting ([`Value`]).
#[test]
fn debug_load_command_human_json_and_unknown_component() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.populate_components(1, true, "");
    helper.add_extension_to_variant("comp1", REACT_ENV, json!({}));

    let output = helper.run_cmd("bit debug-load comp1");
    assert!(output.contains("load stages"), "{output}");
    assert!(output.contains("extension sources"), "{output}");
    assert!(output.contains("environment"), "{output}");
    assert!(output.contains("load issues"), "{output}");
    assert!(output.contains(REACT_ENV), "{output}");
    assert!(output.contains("WorkspaceVariants"), "{output}");
    assert!(output.contains("workspace.get"), "{output}");
    assert!(output.contains("componentsCache"), "{output}");

    let json_out = helper.run_cmd("bit debug-load comp1 --json");
    let parsed: Value = serde_json::from_str(&json_out).unwrap();
    assert_eq!(parsed["trace"]["name"], "debug-load");
    assert!(parsed["trace"]["durationMs"].is_number(), "{parsed}");
    assert!(parsed["trace"]["children"].is_array(), "{parsed}");
    assert!(parsed["extensionSources"].is_array(), "{parsed}");
    assert!(
        parsed["envId"]
            .as_str()
            .is_some_and(|env_id| env_id.contains("teambit.react/react")),
        "{parsed}",
    );
    assert_eq!(parsed["envOrigin"], "WorkspaceVariants");
    assert!(parsed["issues"].is_array(), "{parsed}");

    let err = helper.run_with_try_catch("bit debug-load no/such-component");
    assert!(err.contains(r#"unable to find "no/such-component" in the workspace"#), "{err}");
}
