//! `e2e/harmony/revert.e2e.ts`.

use crate::{helper::Helper, known_failure::Native};
use serde_json::Value;
use std::fs;

/// `bitMap.read()`: `.bitmap` without its leading comment.
fn read_bitmap(helper: &Helper) -> Value {
    let text = fs::read_to_string(helper.scopes.local_path.join(".bitmap")).unwrap();
    crate::helper::parse(&text[text.find('{').unwrap()..])
}

/// `fs.readFile(path)`.
fn read_file(helper: &Helper, relative: &str) -> String {
    fs::read_to_string(helper.scopes.local_path.join(relative)).unwrap()
}

/// basic revert: comp1 tagged twice, the second time with `version2`.
fn tagged_twice() -> (Helper, std::path::PathBuf) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.run("tag");
    helper.populate_components(1, false, "version2");
    helper.run("tag");
    let before_revert = helper.clone_workspace();
    (helper, before_revert)
}

/// revert from lane to main › should change the code according to main; should keep the
/// versions intact
#[test]
fn revert_from_a_lane_to_main() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.run("tag");
    crate::helper::remote::publish(&helper);
    helper.run("lane create lane-a");
    helper.populate_components(2, true, "version2");
    helper.run("snap");
    crate::helper::remote::publish(&helper);
    helper.native_output_or_known(r#"revert "**" main"#).native();
    for comp in ["comp1", "comp2"] {
        assert!(!read_file(&helper, &format!("{comp}/index.js")).contains("version2"));
        assert_ne!(read_bitmap(&helper)[comp]["version"], "0.0.1");
    }
}

/// Native `bit revert` declines a target whose remote scope the workspace does not
/// map (`import unmapped remote requires canonical resolver`).
mod known_failures {
    use super::{read_bitmap, read_file, tagged_twice};
    use crate::allow_known_failure;

    /// basic revert › should change the code to the specified version; should keep the
    /// version in .bitmap intact
    #[test]
    fn revert_changes_the_code_and_keeps_the_version() {
        let (helper, _) = tagged_twice();
        allow_known_failure!(helper.native_output_or_known("revert comp1 0.0.1 -x"));
        assert!(!read_file(&helper, "comp1/index.js").contains("version2"));
        assert_eq!(read_bitmap(&helper)["comp1"]["version"], "0.0.2");
    }

    /// basic revert › when the component is modified › should still change the code to the
    /// specified version
    #[test]
    fn revert_overrides_a_modified_component() {
        let (helper, before_revert) = tagged_twice();
        allow_known_failure!(helper.native_output_or_known("revert comp1 0.0.1 -x"));
        helper.get_cloned_workspace(&before_revert);
        helper.populate_components(1, false, "version3");
        allow_known_failure!(helper.native_output_or_known("revert comp1 0.0.1 -x"));
        let content = read_file(&helper, "comp1/index.js");
        assert!(!content.contains("version2"), "{content}");
        assert!(!content.contains("version3"), "{content}");
    }
}
