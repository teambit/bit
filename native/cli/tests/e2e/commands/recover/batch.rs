//! Ordinary recovery uses one final bitmap publication after all selected actions.
use crate::commands::move_paths::support::{bitmap, setup, successful, workspace};
use std::fs;
const REMOVE: &str = "teambit.component/remove";

#[test]
fn wildcard_restores_all_locally_deleted_sources_in_one_batch() {
    let helper = workspace(2, true);
    setup(&helper, "delete comp1 --silent");
    setup(&helper, "delete comp2 --silent");
    let pattern = format!("{}/comp*", helper.scopes.remote);
    let plan =
        bit_object_import::component_recover::Batch::prepare(&helper.scopes.local_path, &pattern)
            .unwrap();
    assert!(
        plan.hydration_ids().is_empty(),
        "locally removed rows must load from Scope, not the workspace: {:?}",
        plan.hydration_ids(),
    );
    successful(&helper, &format!("recover {pattern} -x"));
    let bitmap = bitmap(&helper);
    for index in 1..=2 {
        assert!(
            helper.scopes.local_path
                .join(format!("comp{index}/index.js"))
                .is_file(),
        );
        assert!(bitmap[format!("comp{index}")]["config"].get(REMOVE).is_none());
    }
}

#[test]
fn recovery_overwrites_selected_sources_and_keeps_untracked_companions() {
    let helper = workspace(1, true);
    setup(&helper, "delete comp1 --silent");
    helper.output_file("comp1/index.js", "module.exports='local edit';\n");
    helper.output_file("comp1/untracked.txt", "retain this companion\n");
    successful(&helper, "recover comp1 -x");
    assert_eq!(
        fs::read_to_string(helper.scopes.local_path.join("comp1/index.js")).unwrap(),
        "module.exports=()=> 'comp1';\n",
    );
    assert_eq!(
        fs::read_to_string(helper.scopes.local_path.join("comp1/untracked.txt")).unwrap(),
        "retain this companion\n",
    );
}

#[test]
fn recovery_of_a_clean_component_reports_no_match_without_mutation() {
    let helper = workspace(1, true);
    let output = crate::commands::move_paths::support::compare(&helper, "recover comp1 -x");
    assert!(!output.status.success());
    assert!(output.stderr.contains("no soft-deleted components found matching pattern"));
}

#[test]
fn component_json_removal_range_is_replaced_without_losing_other_aspects() {
    let helper = workspace(1, true);
    let bitmap_before = bitmap(&helper);
    let row = &bitmap_before["comp1"];
    let scope = row["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .unwrap_or(&helper.scopes.remote);
    helper.output_file(
        "comp1/component.json",
        &serde_json::to_string_pretty(&serde_json::json!({
            "componentId":{"scope":scope,"name":"comp1"},
            "propagate":true,
            "extensions":{
                "teambit.component/remove":{"range":"^0.0.1"},
                "teambit.pkg/pkg":{"packageJson":{"identityRecovery":true}},
            },
        }))
        .unwrap(),
    );
    successful(&helper, "recover comp1 -x");
    let value: serde_json::Value = serde_json::from_slice(
        &fs::read(helper.scopes.local_path.join("comp1/component.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(value["extensions"][REMOVE]["removed"], false);
    assert_eq!(value["extensions"]["teambit.pkg/pkg"]["packageJson"]["identityRecovery"], true);
}

#[test]
fn locally_snapped_removal_imports_from_its_staged_model_without_remote_publication() {
    let helper = workspace(1, true);
    setup(&helper, "delete comp1 --silent");
    setup(&helper, "tag comp1 --ignore-issues * --message removed");
    let result = crate::commands::add::support::compare_with_stdout(
        &helper,
        "recover comp1 -x",
        super::remote::stable,
    );
    assert!(result.status.success(), "{}", result.stderr);
    let map = bitmap(&helper);
    let row = map
        .as_object()
        .unwrap()
        .values()
        .find(|row| row["name"] == "comp1")
        .unwrap();
    assert_eq!(row["config"][REMOVE]["removed"], false);
    let directory = row["rootDir"].as_str().unwrap();
    assert!(
        helper.scopes.local_path
            .join(directory)
            .join("index.js")
            .is_file(),
    );
}
