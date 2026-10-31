use crate::{
    commands::{add::support::history_oracle, move_paths::support},
    harmony::lane_adoption::output::durations,
    helper::{Helper, Run, config, remote},
};
use serde_json::Value;

pub(super) struct Fixture {
    pub helper: Helper,
    pub history: String,
    pub original: Value,
}

pub(super) fn initial() -> Fixture {
    let helper = support::workspace(3, false);
    for name in ["comp1", "comp2", "comp3"] {
        config::set_component_env(&helper.scopes.local_path, name, "teambit.harmony/empty-env");
    }
    support::setup(&helper, "lane create dev");
    support::setup(&helper, "snap --unmodified --ignore-issues * --message initial");
    remote::publish(&helper);
    let history = latest(&helper);
    let original = serde_json::json!({
        "comp1":version(&helper,"comp1"),
        "comp2":version(&helper,"comp2"),
        "comp3":version(&helper,"comp3")
    });
    Fixture { helper, history, original }
}

pub(super) fn deleted(modified: bool) -> Fixture {
    let fixture = initial();
    if modified {
        fixture.helper.output_file("comp3/index.js", "console.log('modified');\n");
        support::setup(&fixture.helper, "snap --ignore-issues * --message modified");
    }
    for name in ["comp1", "comp2"] {
        support::setup(&fixture.helper, &format!("delete {name} --silent --lane"));
    }
    support::setup(&fixture.helper, "snap --unmodified --ignore-issues * --message deleted");
    remote::publish(&fixture.helper);
    assert_eq!(
        support::json(&fixture.helper, "list --json")
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    fixture
}

pub(super) fn latest(helper: &Helper) -> String {
    let history = history_json(helper);
    history
        .as_array()
        .unwrap()
        .last()
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned()
}

pub(super) fn version(helper: &Helper, name: &str) -> Value {
    support::bitmap(helper)
        .as_object()
        .unwrap()
        .iter()
        .find(|(key, row)| key.as_str() == name || row["name"] == name)
        .unwrap()
        .1["version"]
        .clone()
}

pub(super) fn assert_three(helper: &Helper) {
    let list = support::json(helper, "list --json");
    assert_eq!(list.as_array().unwrap().len(), 3);
    let bitmap = support::bitmap(helper);
    for name in ["comp1", "comp2", "comp3"] {
        assert!(
            list.as_array()
                .unwrap()
                .iter()
                .any(|row| row["id"]
                    .as_str()
                    .unwrap()
                    .contains(name)),
        );
        let row = bitmap
            .as_object()
            .unwrap()
            .values()
            .find(|row| row["name"] == name)
            .unwrap();
        assert!(
            helper.scopes.local_path
                .join(row["rootDir"].as_str().unwrap())
                .join(row["mainFile"].as_str().unwrap())
                .is_file(),
        );
    }
}

pub(super) fn successful(fixture: &Fixture, action: &str, restore: bool, json: bool) -> Run {
    let command = format!(
        "lane {action} {} -x{}{}",
        fixture.history,
        if restore { " --restore-deleted-components" } else { "" },
        if json { " --json" } else { "" },
    );
    let result = if action == "checkout" || restore {
        history_oracle::compare(&fixture.helper, &command, durations, ["checkout"], false)
    } else {
        support::compare_with_stdout(&fixture.helper, &command, durations)
    };
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
    result
}

/// Only fixture startup from the actual compiled provider may precede setup JSON.
fn history_json(helper: &Helper) -> Value {
    let output = support::setup(helper, "lane history --json");
    let json = output
        .strip_prefix("lane adoption configured provider started\n")
        .or_else(|| output.strip_prefix("lane adoption configured provider started\r\n"))
        .unwrap_or(&output);
    serde_json::from_str(json)
        .expect("exact optional fixture provider banner followed by history JSON")
}

/// Released `AbstractVinyl.write` uses `eol.auto`; these fixture inputs contain only LF.
pub(super) fn written_source(text: &str) -> String {
    if cfg!(windows) { text.replace('\n', "\r\n") } else { text.to_owned() }
}
