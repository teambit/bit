//! `e2e/harmony/debug-load.e2e.ts`.

use crate::helper::Helper;
use serde_json::{Value, json};

/// - `bit debug-load command › component with an env set via workspace variants › human output › should print all four sections`
/// - `bit debug-load command › component with an env set via workspace variants › human output › should attribute the env to the variants source`
/// - `bit debug-load command › component with an env set via workspace variants › human output › should show load stages with cache info`
/// - `bit debug-load command › component with an env set via workspace variants › json output › should emit a valid trace tree with durations`
/// - `bit debug-load command › component with an env set via workspace variants › json output › should emit extension sources, env resolution and issues`
/// - `bit debug-load command › component with an env set via workspace variants › unknown component id › should fail with a clear error and no stack trace`
#[test]
fn debug_load_command_human_json_and_unknown_component() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.populate_components(1, true, "");
    helper.add_extension_to_variant("comp1", "teambit.react/react", json!({}));

    let output = helper.run_cmd("bit debug-load comp1");
    assert!(output.contains("load stages"), "{output}");
    assert!(output.contains("extension sources"), "{output}");
    assert!(output.contains("environment"), "{output}");
    assert!(output.contains("load issues"), "{output}");
    assert!(output.contains("teambit.react/react"), "{output}");
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
