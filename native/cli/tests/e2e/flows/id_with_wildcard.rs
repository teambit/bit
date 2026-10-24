//! `e2e/flows/id-with-wildcard.e2e.ts`.

use crate::helper::{Helper, config, parse, remote};
use std::ffi::OsStr;

fn setup_wildcard_workspace() -> (Helper, std::path::PathBuf) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("utils/is/string/string.js", "module.exports = 'string';");
    helper.output_file("utils/is/type/type.js", "module.exports = 'type';");
    helper.output_file("utils/fs/read/read.js", "module.exports = 'read';");
    helper.output_file("utils/fs/write/write.js", "module.exports = 'write';");
    helper.create_component_bar_foo("module.exports = 'foo';");
    helper.add_component_bar_foo();
    helper.native("add utils/is/* -n utils/is");
    helper.native("add utils/fs/* -n utils/fs");
    let clone = helper.clone_workspace();
    (helper, clone)
}

/// component id with wildcard › tag with wildcard
/// component id with wildcard › remove with wildcard
/// component id with wildcard › untag with wildcard
#[test]
fn wildcard_tag_remove_and_untag() {
    let (helper, scope_after_add) = setup_wildcard_workspace();

    // tag with wildcard
    let tag_none = helper.cmd(r#"tag "none/*""#);
    assert!(!tag_none.status.success());
    let tag_none_combined = format!("{}{}", tag_none.stdout, tag_none.stderr);
    assert!(
        tag_none_combined.contains(r#"unable to find any component matching the "none/*" pattern"#),
        "{tag_none_combined}",
    );

    let tag_out = helper.native(r#"tag "**/utils/is/*" --message v1"#);
    assert!(tag_out.contains("2 component(s) tagged"));
    assert!(tag_out.contains("utils/is/string"));
    assert!(tag_out.contains("utils/is/type"));
    let status = parse(&helper.native("status --json"));
    assert_eq!(
        status["stagedComponents"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
    assert_eq!(
        status["newComponents"]
            .as_array()
            .unwrap()
            .len(),
        3,
    );

    // remove with wildcard
    helper.get_cloned_workspace(&scope_after_add);
    helper.native("tag --message all");
    let rm_none = helper.cmd(r#"remove "none/*" --silent"#);
    assert!(!rm_none.status.success());
    let rm_none_combined = format!("{}{}", rm_none.stdout, rm_none.stderr);
    assert!(
        rm_none_combined.contains("unable to find any component matching"),
        "{rm_none_combined}",
    );

    let rm_out = helper.native(r#"remove "**/utils/fs/*" --silent"#);
    assert!(rm_out.contains("utils/fs/read"));
    assert!(rm_out.contains("utils/fs/write"));
    let status_after_rm = parse(&helper.native("status --json"));
    assert_eq!(
        status_after_rm["stagedComponents"]
            .as_array()
            .unwrap()
            .len(),
        3,
    );

    // untag (reset) with wildcard
    helper.get_cloned_workspace(&scope_after_add);
    helper.native("tag --message all");
    let reset_none = helper.cmd(r#"reset "none/*""#);
    assert!(!reset_none.status.success());
    let reset_none_combined = format!("{}{}", reset_none.stdout, reset_none.stderr);
    assert!(
        reset_none_combined.contains("unable to find any component matching"),
        "{reset_none_combined}",
    );

    let reset_out = helper.native(r#"reset "**/*/is/*""#);
    assert!(reset_out.contains("2 component(s) reset successfully"));
    assert!(reset_out.contains("utils/is/string"));
    assert!(reset_out.contains("utils/is/type"));
    let status_after_reset = parse(&helper.native("status --json"));
    assert_eq!(
        status_after_reset["stagedComponents"]
            .as_array()
            .unwrap()
            .len(),
        3,
    );
    assert_eq!(
        status_after_reset["newComponents"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
}

/// component id with wildcard › remove from remote with wildcard
/// component id with wildcard › remove from remote with wildcard after removed locally
/// component id with wildcard › export with wildcard
#[test]
fn wildcard_remote_remove_and_export() {
    let (helper, scope_after_add) = setup_wildcard_workspace();
    helper.native("tag --message all");
    remote::publish(&helper);

    let hard_none = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &format!(r#"delete "{}/none/*" --hard --silent"#, helper.scopes.remote),
        &[("BIT_FEATURES", OsStr::new("hard-delete"))],
    );
    assert!(!hard_none.status.success());

    let hard_some = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &format!(r#"delete "{}/utils/fs/*" --hard --silent"#, helper.scopes.remote),
        &[("BIT_FEATURES", OsStr::new("hard-delete"))],
    );
    assert!(hard_some.status.success(), "{hard_some:?}");
    assert!(hard_some.stdout.contains("utils/fs/read"));
    assert!(hard_some.stdout.contains("utils/fs/write"));
    let ls_remote = parse(&helper.native(&format!("list {} --json", helper.scopes.remote)));
    assert_eq!(ls_remote.as_array().unwrap().len(), 3);

    // remove from remote after removed locally
    helper.get_cloned_workspace(&scope_after_add);
    helper.re_init_remote_scope();
    helper.native("tag --message all");
    remote::publish(&helper);
    helper.native(&format!(r#"remove "{}/**" --silent"#, helper.scopes.remote));
    let hard_after_local = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &format!(r#"delete "{}/utils/fs/*" --hard --silent"#, helper.scopes.remote),
        &[("BIT_FEATURES", OsStr::new("hard-delete"))],
    );
    assert!(hard_after_local.status.success(), "{hard_after_local:?}");
    assert!(hard_after_local.stdout.contains("utils/fs/read"));
    assert!(hard_after_local.stdout.contains("utils/fs/write"));
    let ls_remote2 = parse(&helper.native(&format!("list {} --json", helper.scopes.remote)));
    assert_eq!(ls_remote2.as_array().unwrap().len(), 3);

    // export with wildcard
    helper.get_cloned_workspace(&scope_after_add);
    helper.re_init_remote_scope();
    helper.native("tag --message all");
    let exp_none = helper.native(r#"export "none/*""#);
    assert!(exp_none.contains("nothing to export"));

    let exp_some = helper.native(r#"export "*/fs/*""#);
    assert!(exp_some.contains("exported components (2)"));
    let ls_remote3 = parse(&helper.native(&format!("list {} --json", helper.scopes.remote)));
    assert_eq!(ls_remote3.as_array().unwrap().len(), 2);
    let status_after_exp = parse(&helper.native("status --json"));
    assert_eq!(
        status_after_exp["stagedComponents"]
            .as_array()
            .unwrap()
            .len(),
        3,
    );
}

/// component id with wildcard › checkout with wildcard
/// component id with wildcard › diff with wildcard
/// component id with wildcard › list with wildcard
/// component id with wildcard › list remote with wildcard
#[test]
fn wildcard_checkout_diff_and_list() {
    let (helper, scope_after_add) = setup_wildcard_workspace();
    helper.native("tag --message v1");
    helper.native("tag --unmodified --ver 0.0.5 --message v5");

    let co_none = helper.cmd(r#"checkout 0.0.1 "none/*""#);
    assert!(!co_none.status.success());

    let co_some = helper.native(r#"checkout 0.0.1 "**/utils/is/*""#);
    assert!(co_some.contains("successfully switched 2 components"));
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["utils/is/string"]["version"].as_str(), Some("0.0.1"));
    assert_eq!(bitmap["utils/is/type"]["version"].as_str(), Some("0.0.1"));
    assert_eq!(bitmap["utils/fs/read"]["version"].as_str(), Some("0.0.5"));
    assert_eq!(bitmap["utils/fs/write"]["version"].as_str(), Some("0.0.5"));
    assert_eq!(bitmap["bar/foo"]["version"].as_str(), Some("0.0.5"));

    // diff with wildcard
    helper.get_cloned_workspace(&scope_after_add);
    helper.native("tag --message v1");
    helper.output_file("utils/is/string/string.js", "");
    helper.output_file("utils/is/type/type.js", "");
    helper.output_file("utils/fs/read/read.js", "");
    helper.output_file("utils/fs/write/write.js", "");
    helper.create_component_bar_foo("");

    let diff_none = helper.cmd(r#"diff "none/*""#);
    assert!(!diff_none.status.success());

    let diff_some = helper.native(r#"diff "**/utils/is/*""#);
    assert!(diff_some.contains("utils/is/string"));
    assert!(diff_some.contains("utils/is/type"));
    assert!(!diff_some.contains("utils/fs/read"));
    assert!(!diff_some.contains("utils/fs/write"));
    assert!(!diff_some.contains("bar/foo"));

    // list with wildcard
    let list_local = helper.native(r#"list --local-scope --namespace "bar/*""#);
    assert!(list_local.contains("bar/foo"));
    assert!(!list_local.contains("utils"));

    // list remote with wildcard
    helper.get_cloned_workspace(&scope_after_add);
    helper.native("tag --message v1");
    helper.re_init_remote_scope();
    remote::publish(&helper);
    let list_remote =
        helper.native(&format!(r#"list {} --ids --namespace "bar/*""#, helper.scopes.remote));
    assert!(list_remote.contains("bar/foo"));
    assert!(!list_remote.contains("utils"));
}
