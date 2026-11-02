//! End-to-end dependency policy update tests ([`RESOLVER`]) for workspace adoption and `bit import --write-deps` manifests.
//!
//! Verifies [`fixture`] and [`command`] policy range updates in `workspace.jsonc` and `package.json`.

use super::command;
use crate::{
    commands::move_paths::support,
    helper::{Helper, config, remote},
};
use serde_json::{Value, json};
/// Canonical aspect ID for `teambit.dependencies/dependency-resolver`.
const RESOLVER: &str = "teambit.dependencies/dependency-resolver";
/// Creates a workspace with `comp2` imported and `comp1` published with a lower `adoption-package` range.
fn fixture() -> Helper {
    let helper = support::workspace(2, false);
    helper.output_file(
        "node_modules/adoption-package/package.json",
        r#"{"name":"adoption-package","version":"1.4.0","main":"index.js"}"#,
    );
    helper.output_file("node_modules/adoption-package/index.js", "module.exports=1;\n");
    for (name, range) in [("comp1", "^1.2.0"), ("comp2", "^1.4.0")] {
        helper.output_file(
            &format!("{name}/index.js"),
            "module.exports=require('adoption-package');\n",
        );
        let mut bitmap = support::bitmap(&helper);
        bitmap[name]["config"][RESOLVER] =
            json!({"policy":{"dependencies":{"adoption-package":range}}});
        config::write_json(&helper.scopes.local_path.join(".bitmap"), &bitmap, b"    ");
    }
    support::tag(&helper);
    remote::publish(&helper);
    helper.re_init_workspace_with(false);
    helper.add_remote_scope();
    support::setup(&helper, &command(&helper, "comp2", ""));
    helper
}
/// Verifies `--write-deps package.json` on [`fixture`] selects the highest component policy range and preserves unrelated fields.
#[test]
fn write_deps_package_json_selects_the_highest_component_range_and_preserves_other_fields() {
    let helper = fixture();
    let path = helper.scopes.local_path.join("package.json");
    let package = json!({"name":"adoption-workspace","version":"1.0.0","private":true,"adoptionSentinel":{"preserved":true}});
    config::write_json(&path, &package, b"  ");
    super::successful(&helper, &command(&helper, "comp1", "--write-deps package.json"));
    let package = config::read_jsonc(&path);
    assert_eq!(package["dependencies"]["adoption-package"], "^1.4.0");
    assert_eq!(package["adoptionSentinel"], json!({"preserved":true}));
}
/// Verifies `--write-deps workspace.jsonc` selects the highest policy range for [`RESOLVER`] and preserves comments.
#[test]
fn write_deps_workspace_jsonc_selects_the_highest_range_and_preserves_comments() {
    let helper = fixture();
    let path = helper.scopes.local_path.join("workspace.jsonc");
    let before = std::fs::read_to_string(&path).unwrap();
    std::fs::write(&path, format!("// adoption policy sentinel\n{before}")).unwrap();
    super::successful(&helper, &command(&helper, "comp1", "--write-deps workspace.jsonc"));
    let workspace: Value = config::read_jsonc(&path);
    assert_eq!(workspace[RESOLVER]["policy"]["dependencies"]["adoption-package"], "^1.4.0");
    assert!(std::fs::read_to_string(path).unwrap().contains("// adoption policy sentinel"));
}
