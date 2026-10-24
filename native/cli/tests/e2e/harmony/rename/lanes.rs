use crate::{
    commands::move_paths::support::{self, aspect, json, setup, successful},
    helper::{Helper, config, remote},
};
#[test]
fn lane_rename_removal_merges_to_main_only_when_the_source_exists_on_main() {
    for main_exists in [true, false] {
        let helper = workspace(main_exists);
        // Publish the delay provider's main version even when comp1/comp2 are
        // new on main; lane exports otherwise lack that provider parent object.
        remote::publish(&helper);
        setup(&helper, "lane create renamed");
        setup(&helper, "snap --unmodified --ignore-issues * --message lane");
        remote::publish(&helper);
        successful(&helper, "rename comp1 comp11");
        setup(&helper, "diff");
        setup(&helper, "snap --ignore-issues * --message renamed");
        let lane = json(&helper, "cat-lane renamed");
        let head = lane["components"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["id"]["name"] == "comp1")
            .unwrap()["head"]
            .clone();
        remote::publish(&helper);
        setup(&helper, "lane switch main -x");
        setup(&helper, "lane merge renamed -x --message merge");
        let model = json(&helper, "cat-component comp1 --json");
        assert_eq!(model["head"] == head, main_exists);
        if main_exists {
            assert_eq!(
                aspect(&helper, "comp1", "teambit.component/remove").unwrap()["removed"],
                true,
            );
        }
    }
}

fn workspace(main_exists: bool) -> Helper {
    let helper = support::workspace(2, false);
    install_delay(&helper);
    if main_exists {
        support::tag(&helper);
    }
    helper
}
pub(super) fn install_delay(helper: &Helper) {
    let source = include_str!("lane_delay.cjs");
    helper.output_file("lane-delay/index.js", source);
    setup(helper, "add lane-delay -i env/lane-delay");
    config::set_component_env(&helper.scopes.local_path, "env/lane-delay", "teambit.envs/env");
    setup(helper, "link");
    helper.output_file("lane-delay/dist/index.js", source);
    setup(helper, "tag env/lane-delay --ignore-issues * --message provider");
    config::set_workspace_key(
        &helper.scopes.local_path,
        &format!("{}/env/lane-delay", helper.scopes.remote),
        serde_json::json!({}),
    );
}

pub(super) fn delay_new(helper: &Helper, target: &str) {
    install_delay(helper);
    helper.output_file("identity-load-delay-target", target);
}
