//! `e2e/harmony/lanes/bit-checkout-on-lanes.e2e.ts`.

mod parity_bugs {
    use crate::helper::{FOO_FIXTURE, Helper, config, parse, remote};
    use std::fs;

    fn head_of_lane(helper: &Helper, lane: &str, name: &str) -> String {
        let lane_obj = parse(&helper.native(&format!("lane show {lane} --json")));
        lane_obj["components"]
            .as_array()
            .unwrap()
            .iter()
            .find(|comp| {
                comp["id"]["name"].as_str() == Some(name)
                    || comp["id"]
                        .as_str()
                        .is_some_and(|id| id.ends_with(&format!("/{name}")))
            })
            .unwrap()["head"]
            .as_str()
            .unwrap()
            .to_owned()
    }

    /// bit checkout command when on a lane › checkout head when some components are merge-pending › should leave the merge-pending component with the current version
    /// bit checkout command when on a lane › checkout head when some components are merge-pending › should not update the non-merge-pending component to the latest
    /// bit checkout command when on a lane › checkout head when some components are merge-pending › should not write the files of the non-merge-pending component
    #[test]
    #[ignore = "checkout head on a lane checks current == lane_head before Stage::MergePending when local and remote lane heads diverge"]
    fn checkout_head_when_some_components_are_merge_pending() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.populate_components(2, true, "");
        helper.native("lane create dev");
        helper.run("snap");
        remote::publish(&helper);
        let original_ws = helper.clone_workspace();
        helper.append_file("comp2/index.js", "\n// remote-head-change");
        helper.run("snap --unmodified");
        let comp2_remote_head = head_of_lane(&helper, "dev", "comp2");
        remote::publish(&helper);

        helper.get_cloned_workspace(&original_ws);
        helper.run("snap comp1 --unmodified");
        let comp1_head = head_of_lane(&helper, "dev", "comp1");
        helper.run("import");

        let run = helper.native_run("checkout head -x");
        assert!(!run.status.success(), "stdout: {}\nstderr: {}", run.stdout, run.stderr);
        let output = format!("{}{}", run.stdout, run.stderr);
        assert!(
            output.contains("component is merge-pending and cannot be checked out"),
            "{output}",
        );

        let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
        assert_eq!(bitmap["comp1"]["version"].as_str(), Some(comp1_head.as_str()));
        assert_ne!(bitmap["comp2"]["version"].as_str(), Some(comp2_remote_head.as_str()));
        let comp2_source =
            fs::read_to_string(helper.scopes.local_path.join("comp2/index.js")).unwrap();
        assert!(!comp2_source.contains("remote-head-change"), "{comp2_source}");
    }

    /// bit checkout command when on a lane › checkout head on main when some components are not available on main › should make them available on main even without running bit-import before
    #[test]
    #[ignore = "checkout head on main does not yet call makeLaneComponentsAvailableOnMain for inactive bitmap entries"]
    fn checkout_head_on_main_when_some_components_are_not_available_on_main() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
        helper.run("add comp1");
        helper.run("tag");
        remote::publish(&helper);
        helper.native("lane create dev");
        helper.create_component_bar_foo(FOO_FIXTURE);
        helper.add_component_bar_foo();
        helper.run("snap --unmodified");
        remote::publish(&helper);
        helper.native("switch main -x");
        let list_before = parse(&helper.native("list --json"));
        assert_eq!(list_before.as_array().unwrap().len(), 1);

        let workspace_before_merge = helper.clone_workspace();
        helper.re_init_workspace();
        helper.add_remote_scope();
        let scope = helper.scopes.remote.clone();
        helper.run(&format!("lane merge {scope}/dev -x"));
        remote::publish(&helper);

        helper.get_cloned_workspace(&workspace_before_merge);
        helper.native("checkout head -x");
        let list_after = parse(&helper.native("list --json"));
        assert_eq!(list_after.as_array().unwrap().len(), 2);
    }
}
