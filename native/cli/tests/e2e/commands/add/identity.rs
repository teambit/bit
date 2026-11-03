//! End-to-end tests ([`compare`]) verifying re-tracking keeps published identities and variant scopes distinct from the workspace's current `defaultScope`.
//!
//! Verifies exported component scope preservation across [`workspace`], [`config`], and [`remote`] operations.
use super::support::{compare, workspace};
use crate::helper::{config, remote};
use serde_json::json;

/// Verifies [`compare`] preserves exported component scopes in `.bitmap` when re-adding after `defaultScope` changes.
#[test]
fn exported_component_readd_keeps_its_scope_after_default_scope_changes() {
    let helper = workspace();
    helper.re_init_remote_scope();
    helper.add_remote_scope();
    helper.output_file("bar/index.js", "module.exports=1;\n");
    helper.run("add bar -i bar/foo");
    helper.tag_without_build("bar/foo", "--message initial");
    remote::publish(&helper);
    config::set_workspace_aspect_key(
        &helper.scopes.local_path,
        "defaultScope",
        json!("other.scope"),
    );
    helper.output_file("bar/extra.js", "module.exports=2;\n");
    compare(&helper, "add bar");
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    let row = bitmap
        .as_object()
        .unwrap()
        .values()
        .find(|row| row["rootDir"] == "bar")
        .unwrap();
    assert_eq!(row["scope"], helper.scopes.remote);
    assert_eq!(row["version"], "0.0.1");
}

/// Verifies that components with identical names in distinct scopes retain separate `.bitmap` entries.
///
/// Confirms `first.scope/shared` and `second.scope/shared` coexist in `.bitmap`.
#[test]
fn equal_component_names_in_distinct_scopes_keep_distinct_bitmap_entries() {
    let helper = workspace();
    helper.output_file("first/index.js", "module.exports=1;\n");
    helper.output_file("second/index.js", "module.exports=2;\n");
    helper.run("add first -i shared -s first.scope");
    compare(&helper, "add second -i shared -s second.scope");
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    let roots: std::collections::BTreeSet<_> = bitmap
        .as_object()
        .unwrap()
        .values()
        .filter_map(|row| row["rootDir"].as_str())
        .collect();
    assert_eq!(roots, std::collections::BTreeSet::from(["first", "second"]));
}

/// Verifies [`compare`] applies directory variant `defaultScope` even when `--id` specifies a namespace.
///
/// Ensures `teambit.workspace/variants` directory entries override workspace-level `defaultScope`.
#[test]
fn directory_variant_default_scope_applies_even_with_an_explicit_namespaced_id() {
    let helper = workspace();
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.workspace/variants",
        json!({"second":{"defaultScope":"variant.direct"}}),
    );
    helper.output_file("second/index.js", "module.exports=2;\n");
    let result = compare(&helper, "add second --id bar/second");
    assert!(result.status.success(), "{}", result.stderr);
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["bar/second"]["defaultScope"], "variant.direct");
}
