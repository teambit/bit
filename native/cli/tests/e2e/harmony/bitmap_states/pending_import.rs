//! Upstream 3b52056c6 removes duplicate pending-import errors after released 2.2.146.
use crate::helper::{Helper, parse};
use serde_json::json;
use std::ffi::OsStr;

pub(super) fn verify(helper: &Helper) {
    let copy = helper.clone_workspace();
    let native = helper.native_run("status --json");
    let node = Helper::cmd_in_with(&copy, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(native.status.code(), Some(0));
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stderr, node.stderr);
    let mut previous = parse(&node.stdout);
    assert_eq!(
        previous["invalidComponents"],
        json!([
            {"id":"my-scope/bar/foo","error":{"isUserError":true,"name":"ComponentsPendingImport"}},
        ]),
    );
    assert_eq!(previous["importPendingComponents"], json!(["my-scope/bar/foo"]));
    previous["invalidComponents"] = json!([]);
    assert_eq!(parse(&native.stdout), previous);
    verify_text(helper);
}

fn verify_text(helper: &Helper) {
    let copy = helper.clone_workspace();
    let native = helper.native_run("status");
    let node = Helper::cmd_in_with(&copy, "status", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(native.status.code(), Some(0));
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stderr, node.stderr);
    let previous = concat!(
        "invalid components (1)\n  these components failed to load\n",
        "   ⚠ my-scope/bar/foo ... component objects are missing from the scope ",
        r#"(use "bit import [component_id] --objects" to get them back)"#,
        "\n",
    );
    let prefix = node.stdout.strip_suffix(previous).unwrap();
    let check = if cfg!(windows) { "✓" } else { "✔" };
    assert_eq!(
        native.stdout,
        format!(
            "{prefix}{check} {}\n",
            r#"nothing to tag or export (use "bit create <template> <component>" to generate a new component)"#,
        ),
    );
}
