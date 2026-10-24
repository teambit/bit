//! `e2e/harmony/lanes/abort-merge-lane.e2e.ts`.

use crate::helper::{Helper, config, parse, remote};
use std::fs;

fn populate(helper: &Helper, count: usize, rewire: bool, suffix: &str) {
    for index in 1..=count {
        let content = if index == count {
            format!("module.exports = () => 'comp{index}{suffix}';")
        } else {
            let next = format!("comp{}", index + 1);
            let req = if rewire {
                format!("@{}/{next}", helper.scopes.remote)
            } else {
                format!("../{next}")
            };
            format!(
                "const {next} = require('{req}');\nmodule.exports = () => `comp{index}{suffix} and ${{{next}()}}`;",
            )
        };
        helper.output_file(&format!("comp{index}/index.js"), &content);
        let _ = helper.cmd(&format!("add comp{index}"));
    }
    if rewire {
        helper.run("link --rewire");
    }
}

/// bit lane merge-abort command › when the lane was merged successfully without conflicts or diverged › should revert the .bitmap to the state before the merge
/// bit lane merge-abort command › when the lane was merged successfully without conflicts or diverged › should revert the lane object to the state before the merge
/// bit lane merge-abort command › when the lane was merged successfully without conflicts or diverged › should reset the source code to pre-merge
#[test]
fn when_the_lane_was_merged_successfully_without_conflicts_or_diverged() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    populate(&helper, 2, true, "");
    helper.native("lane create lane-a");
    helper.run("snap --unmodified --ignore-issues *");
    remote::publish(&helper);
    helper.native("lane create lane-b");
    populate(&helper, 1, true, "version2");
    helper.run("snap comp1 --ignore-issues *");
    remote::publish(&helper);
    helper.native("switch lane-a -x");
    let bitmap_before = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    helper.native("lane merge lane-b --skip-dependency-installation");
    let bitmap_after = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    helper.native("lane merge-abort --silent --skip-dependency-installation");

    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["comp1"]["version"], bitmap_before["comp1"]["version"]);
    assert_ne!(bitmap["comp1"]["version"], bitmap_after["comp1"]["version"]);

    let lane_obj = parse(&helper.native("lane show lane-a --json"));
    let comp_a = lane_obj["components"]
        .as_array()
        .unwrap()
        .iter()
        .find(|comp| {
            comp["id"]["name"].as_str() == Some("comp1")
                || comp["id"]
                    .as_str()
                    .is_some_and(|id| id.ends_with("/comp1"))
        })
        .unwrap();
    assert_eq!(comp_a["head"], bitmap_before["comp1"]["version"]);
    assert_ne!(comp_a["head"], bitmap_after["comp1"]["version"]);

    let comp1_content =
        fs::read_to_string(helper.scopes.local_path.join("comp1/index.js")).unwrap();
    assert!(!comp1_content.contains("version2"), "{comp1_content}");
}

/// bit lane merge-abort command › when the merged lane introduced new components › should delete the newly introduced component root-dirs
#[test]
fn when_the_merged_lane_introduced_new_components() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    populate(&helper, 1, false, "");
    helper.native("lane create lane-a");
    helper.run("snap --unmodified --ignore-issues *");
    remote::publish(&helper);
    helper.native("lane create lane-b");
    populate(&helper, 2, true, "v2");
    helper.run("snap --unmodified --ignore-issues *");
    remote::publish(&helper);

    helper.re_init_workspace();
    helper.add_remote_scope();
    let scope = helper.scopes.remote.clone();
    helper.native(&format!("switch {scope}/lane-a -x"));
    helper.native(&format!("lane merge {scope}/lane-b --no-snap --skip-dependency-installation"));
    assert!(
        helper.scopes.local_path
            .join(format!("{scope}/comp2"))
            .is_dir(),
    );
    helper.native("lane merge-abort --silent --skip-dependency-installation");
    assert!(
        !helper.scopes.local_path
            .join(format!("{scope}/comp2"))
            .exists(),
    );
}
