//! End-to-end tests for `e2e/harmony/no-files.e2e.ts` ([`component_files_or_directory_missing_or_gitignored`], [`MISSING_IN_PATH_ERR`]).
//! Verifies `list` and `status` resilience when component files or directories are deleted or ignored in `.gitignore` ([`Helper`]).

use crate::helper::{Helper, parse};

/// Error class name reported in `invalidComponents` when a component directory or its files are missing ([`component_files_or_directory_missing_or_gitignored`], [`Helper`]).
const MISSING_IN_PATH_ERR: &str = "ComponentNotFoundInPath";

/// Verifies `bit list` and `bit status` when a component's files or directory are deleted or `.gitignore`d ([`MISSING_IN_PATH_ERR`], [`Helper`], [`parse`]).
#[test]
fn component_files_or_directory_missing_or_gitignored() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("status");
    let base_ws = helper.clone_workspace();

    // 1. Component directory deleted
    helper.delete_path("comp1");
    helper.native("list --local-scope");
    let status1 = parse(&helper.native("status --json"));
    assert_eq!(
        status1["invalidComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(
        status1["invalidComponents"][0]["error"]["name"].as_str(),
        Some(MISSING_IN_PATH_ERR),
    );
    let status1_again = parse(&helper.native("status --json"));
    assert_eq!(
        status1_again["invalidComponents"][0]["error"]["name"].as_str(),
        Some("ComponentNotFoundInPath"),
    );

    // 2. Component files deleted
    helper.get_cloned_workspace(&base_ws);
    helper.delete_path("comp1/index.js");
    helper.native("list --local-scope");
    let status2 = parse(&helper.native("status --json"));
    assert_eq!(
        status2["invalidComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(
        status2["invalidComponents"][0]["error"]["name"].as_str(),
        Some("ComponentNotFoundInPath"),
    );

    // 3. Component directory ignored by .gitignore
    helper.get_cloned_workspace(&base_ws);
    helper.output_file(".gitignore", "comp1");
    helper.native("list --local-scope");
    let status3 = parse(&helper.native("status --json"));
    assert_eq!(
        status3["invalidComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(status3["invalidComponents"][0]["error"]["name"].as_str(), Some("IgnoredDirectory"));
    let status3_again = parse(&helper.native("status --json"));
    assert_eq!(
        status3_again["invalidComponents"][0]["error"]["name"].as_str(),
        Some("IgnoredDirectory"),
    );
}
