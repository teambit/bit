//! `e2e/harmony/snap.e2e.ts`.

mod merge;

use crate::helper::{FOO_FIXTURE, Helper, config, len, parse};
use serde_json::json;

const FOO_V2: &str = "module.exports = function foo() { return 'got foo v2'; }";
const COMP3_V2: &str = "module.exports = () => 'comp3 v2';";

#[test]
fn snap_before_tag_and_untag_a_snap() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    let output = helper.snap_Component_without_build("bar/foo", "");
    assert!(output.contains("1 component(s) snapped"));

    let foo = parse(&helper.cat_component("bar/foo"));
    let head = foo["head"].as_str().unwrap();
    assert_eq!(head.len(), 40);

    let list_scope = helper.list_local_scope_parsed("");
    let hash = list_scope[0]["localVersion"].as_str().unwrap();
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["bar/foo"]["version"].as_str(), Some(hash));

    let status = helper.status();
    assert!(status.contains("staged components"));

    helper.create_component_bar_foo(FOO_V2);
    let tag_output = helper.tag_all_without_build("");
    assert!(tag_output.contains("1 component(s) tagged"));
    let foo_tagged = parse(&helper.cat_component("bar/foo"));
    assert_eq!(foo_tagged["head"], foo_tagged["versions"]["0.0.1"]);

    helper.snap_Component_without_build("bar/foo", "--unmodified");
    let second_tag = helper.tag_Without_Build_id("bar/foo", "--unmodified");
    assert!(second_tag.contains("0.0.2"));
    let foo_tagged_v2 = parse(&helper.cat_component("bar/foo"));
    assert_eq!(foo_tagged_v2["head"], foo_tagged_v2["versions"]["0.0.2"]);

    assert_untag_head_snap(&helper);
}

fn assert_untag_head_snap(helper: &Helper) {
    helper.re_init_workspace();
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    helper.snap_Component_without_build("bar/foo", "--unmodified");
    let first_snap = helper.get_head("bar/foo");
    helper.snap_Component_without_build("bar/foo", "--unmodified");
    helper.untag("bar/foo --head");
    let after_untag = parse(&helper.cat_component("bar/foo"));
    assert_eq!(after_untag["head"].as_str(), Some(first_snap.as_str()));
    assert_eq!(
        after_untag["state"]["versions"]
            .as_object()
            .unwrap()
            .len(),
        1,
    );
}

#[test]
fn components_with_dependencies() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.snap_all_components_without_build("");

    let comp1 = parse(&helper.cat_component("comp1@latest"));
    let deps = comp1["dependencies"].as_array().unwrap();
    assert_eq!(deps.len(), 1);
    assert_eq!(
        deps[0]["id"]["version"]
            .as_str()
            .unwrap()
            .len(),
        40,
    );

    let status = helper.status_json();
    assert_eq!(len(&status["snappedComponents"]), 3);

    let before_tag = helper.clone_workspace();
    let tag_all = helper.tag_all_without_build("");
    assert!(tag_all.contains("3 component(s) tagged"));

    helper.get_cloned_workspace(&before_tag);
    let tag_snapped = helper.tag_all_without_build("--snapped");
    assert!(tag_snapped.contains("3 component(s) tagged"));
}

#[test]
fn checkout_and_diff_for_snaps() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    helper.snap_all_components_without_build("");
    let first_snap = helper.get_head("bar/foo");
    helper.create_component_bar_foo(FOO_V2);
    helper.snap_all_components_without_build("");
    let second_snap = helper.get_head("bar/foo");

    let diff = helper.diff(&format!("bar/foo {first_snap}"));
    assert!(diff.contains(&format!("--- foo.js ({first_snap})")));
    assert!(diff.contains(&format!("+++ foo.js ({second_snap})")));
    assert!(diff.contains("-module.exports = function foo() { return 'got foo'; }"));
    assert!(diff.contains("+module.exports = function foo() { return 'got foo v2'; }"));

    let checkout_first = helper.checkout(&format!("{first_snap} bar/foo"));
    assert!(checkout_first.contains("successfully"));
    assert!(checkout_first.contains(&first_snap));
    assert_eq!(helper.read_file("bar/foo.js"), FOO_FIXTURE);

    let checkout_head = helper.checkout("head bar/foo");
    assert!(checkout_head.contains("successfully"));
    assert!(checkout_head.contains(&second_snap));
    assert_eq!(helper.read_file("bar/foo.js"), FOO_V2);
}

#[test]
fn auto_snap_and_import() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.snap_all_components_without_build("");

    helper.output_file("comp3/index.js", COMP3_V2);
    let status_out = helper.status();
    assert!(status_out.contains("components pending auto-tag"));

    let snap_output = helper.snap_Component_without_build("comp3", "");
    assert!(snap_output.contains("auto-snapped dependents"));
    let comp3_head = helper.get_head("comp3");
    let comp2_head = helper.get_head("comp2");

    let comp2 = parse(&helper.cat_component("comp2@latest"));
    assert_eq!(comp2["dependencies"][0]["id"]["name"], "comp3");
    assert_eq!(comp2["dependencies"][0]["id"]["version"], comp3_head);
    assert!(
        comp2["flattenedDependencies"]
            .as_array()
            .unwrap()
            .contains(&json!({
                "name": "comp3",
                "scope": helper.scopes.remote,
                "version": comp3_head,
            })),
    );

    assert_auto_snap_comp1_status_and_import(&helper, &comp2_head, &comp3_head);
}

fn assert_auto_snap_comp1_status_and_import(helper: &Helper, comp2_head: &str, comp3_head: &str) {
    let comp1 = parse(&helper.cat_component("comp1@latest"));
    assert_eq!(comp1["dependencies"][0]["id"]["name"], "comp2");
    assert_eq!(comp1["dependencies"][0]["id"]["version"], comp2_head);
    let flat = comp1["flattenedDependencies"].as_array().unwrap();
    assert!(flat.contains(&json!({
        "name": "comp3",
        "scope": helper.scopes.remote,
        "version": comp3_head,
    })));
    assert!(flat.contains(&json!({
        "name": "comp2",
        "scope": helper.scopes.remote,
        "version": comp2_head,
    })));

    let status = helper.status_json();
    assert_eq!(len(&status["modifiedComponents"]), 0);
    assert_eq!(len(&status["stagedComponents"]), 3);

    helper.export("");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("*", "");
    let pkg = format!("@{}/comp1", helper.scopes.remote);
    helper.output_file("app.js", &format!("const comp1 = require('{pkg}');\nconsole.log(comp1())"));
    let out = std::process::Command::new("node")
        .arg("app.js")
        .current_dir(&helper.scopes.local_path)
        .output()
        .unwrap();
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "comp1 and comp2 and comp3 v2");
}

#[test]
fn tag_after_tag_and_snap_after_soft_remove() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.tag_all_without_build("");
    helper.populate_components(1, true, " v2");
    helper.tag_all_without_build("");
    helper.export("");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("comp1", "");
    let cat_old = helper.try_cmd(&format!("cat-component {}/comp1@0.0.1", helper.scopes.remote));
    assert!(!cat_old.status.success());

    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.snap_all_components_without_build("");
    helper.export("");
    helper.run("delete comp1 --silent");
    let snap_out = helper.snap_all_components_without_build("--unmodified");
    assert!(snap_out.contains("removed components"));
    assert!(!snap_out.contains("changed components"));
}

#[test]
fn merge_tags_and_reset_diverged() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.tag_all_without_build("");
    helper.export("");
    let head_before_diverge = helper.get_head("comp1");
    let author_first_tag = helper.clone_workspace();
    helper.populate_components(1, true, " v2");
    helper.tag_all_without_build("");
    helper.export("");
    helper.get_cloned_workspace(&author_first_tag);
    helper.populate_components(1, false, " v3");
    helper.tag_all_without_build("--ver 0.0.3");
    helper.run("import");

    let export_run = helper.try_cmd("export");
    assert!(!export_run.status.success());
    let combined = format!("{}\n{}", export_run.stdout, export_run.stderr);
    assert!(combined.contains("merge error occurred when exporting"));
    let comp_data = parse(&helper.cat_component("comp1"));
    let first_tag = comp_data["versions"]["0.0.1"].as_str().unwrap();
    helper.cat_object(first_tag, false);

    let status_out = helper.status();
    assert!(status_out.contains("bit reset"));
    assert!(status_out.contains("bit merge"));

    assert_reset_diverged(&helper, &head_before_diverge);
}

fn assert_reset_diverged(helper: &Helper, head_before_diverge: &str) {
    let local_head_v3 = helper.get_head("comp1");
    helper.tag_all_without_build("--ver 0.0.4 --unmodified");
    let before_untag = helper.clone_workspace();

    helper.untag("--all");
    let head = helper.get_head("comp1");
    let remote_head = remote_ref_head(helper, "comp1");
    assert_ne!(head, remote_head);
    assert_eq!(head, head_before_diverge);
    let status = helper.status_json();
    assert_eq!(len(&status["modifiedComponents"]), 1);
    assert_eq!(len(&status["outdatedComponents"]), 1);
    helper.expect_status_to_be_clean_except(&["modifiedComponents", "outdatedComponents"]);

    helper.get_cloned_workspace(&before_untag);
    helper.untag("--all --head");
    let head_after_head_reset = helper.get_head("comp1");
    assert_ne!(head_after_head_reset, remote_head);
    assert_eq!(head_after_head_reset, local_head_v3);
}

pub(super) fn remote_ref_head(helper: &Helper, name: &str) -> String {
    let ref_path = helper.scopes.local_path
        .join(".bit/refs/remotes")
        .join(&helper.scopes.remote)
        .join("main");
    let refs = config::read_jsonc(&ref_path);
    refs.as_array()
        .unwrap()
        .iter()
        .find(|entry| entry["id"]["name"].as_str() == Some(name))
        .and_then(|entry| entry["head"].as_str())
        .unwrap()
        .to_owned()
}
