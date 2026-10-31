use crate::helper::{Helper, config};
use std::{ffi::OsStr, fs, path::Path};
pub(super) fn node(helper: &Helper, command: &str) {
    let run = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(run.status.success(), "{command}: {} {}", run.stdout, run.stderr);
}
fn workspace() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'base';");
    helper.add_component_bar_foo();
    let id = format!("{}/env/merge", helper.scopes.remote);
    let source = include_str!("aspect.js").replace("__ENV__", &id);
    helper.output_file("merge-env/index.js", &source);
    helper.run("add merge-env -i env/merge");
    config::set_component_env(&helper.scopes.local_path, "env/merge", "teambit.envs/env");
    helper.run("link");
    helper.output_file("merge-env/dist/index.js", &source);
    node(&helper, "tag env/merge -m environment");
    config::set_component_env(&helper.scopes.local_path, "bar/foo", &id);
    config::set_workspace_key(&helper.scopes.local_path, &id, serde_json::json!({}));
    helper
}
pub(super) fn lane() -> Helper {
    let helper = workspace();
    node(&helper, "tag bar/foo -m base");
    crate::helper::remote::publish(&helper);
    node(&helper, "lane create dev");
    helper.output_file("bar/foo.js", "module.exports = 'lane';");
    node(&helper, "snap bar/foo -m lane");
    crate::helper::remote::publish(&helper);
    node(&helper, "switch main --force-theirs -x");
    helper.output_file("bar/foo.js", "module.exports = 'main';");
    node(&helper, "tag bar/foo -m main");
    crate::helper::remote::publish(&helper);
    helper.delete_path("merge-presnap-events");
    helper
}
pub(super) fn output(text: &str, root: &Path) -> String {
    let text = allocated(text, root);
    text.lines()
        .map(|line| {
            for marker in [
                " (completed in ",
                "Succeeded in ",
                "Completed successfully in ",
                "Failed in ",
                " has failed in ",
            ] {
                if let Some((prefix, _)) = line.split_once(marker) {
                    return format!("{prefix}{marker}DURATION");
                }
            }
            line.to_owned()
        })
        .collect::<Vec<_>>()
        .join("\n")
}
pub(super) fn publication(helper: &Helper, oracle: &Path, success: bool) {
    let actual = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    let expected = config::read_jsonc(&oracle.join(".bitmap"));
    assert_eq!(
        output(&actual.to_string(), &helper.scopes.local_path),
        output(&expected.to_string(), oracle),
    );
    if success {
        assert_versions(&helper.scopes.local_path, oracle);
    } else {
        let left = fs::read_to_string(
            bit_object_import::scope_path(&helper.scopes.local_path).join("staged-snaps"),
        )
        .unwrap();
        let right =
            fs::read_to_string(bit_object_import::scope_path(oracle).join("staged-snaps")).unwrap();
        assert_eq!(output(&left, &helper.scopes.local_path), output(&right, oracle));
        assert_eq!(actual, expected, "failed build must retain the canonical bitmap prefix");
        assert_unpublished(&helper.scopes.local_path, &left);
        assert_unpublished(oracle, &right);
    }
}

pub(super) fn component_original() -> Helper {
    let mut helper = workspace();
    node(&helper, "tag bar/foo -m base");
    crate::helper::remote::publish(&helper);
    let producer = helper.clone_workspace();
    helper.output_file("bar/foo.js", "module.exports = 'local';");
    node(&helper, "snap bar/foo -m local");
    let local = std::mem::replace(&mut helper.scopes.local_path, producer);
    helper.output_file("bar/foo.js", "module.exports = 'remote';");
    node(&helper, "snap bar/foo -m remote");
    crate::helper::remote::publish(&helper);
    helper.scopes.local_path = local;
    node(&helper, &format!("import {}/bar/foo --objects", helper.scopes.remote));
    helper.delete_path("merge-presnap-events");
    helper
}

fn assert_unpublished(root: &Path, staged: &str) {
    for hash in staged.lines() {
        assert_eq!(hash.len(), 40);
        assert!(
            !bit_object_import::scope_path(root)
                .join("objects")
                .join(&hash[..2])
                .join(&hash[2..])
                .exists(),
            "failed builder must not publish staged Version {hash}",
        );
    }
}

fn assert_versions(root: &Path, oracle: &Path) {
    let mut actual = super::super::snapshot_environments::version(root);
    let mut expected = super::super::snapshot_environments::version(oracle);
    for value in [&mut actual, &mut expected] {
        if let Some(logs) = value["modified"].as_array_mut() {
            for log in logs {
                log.as_object_mut()
                    .unwrap()
                    .remove("date");
            }
        }
    }
    super::artifacts::normalize(root, &mut actual);
    super::artifacts::normalize(oracle, &mut expected);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&allocated(&actual.to_string(), root)).unwrap(),
        serde_json::from_str::<serde_json::Value>(&allocated(&expected.to_string(), oracle))
            .unwrap(),
    );
}

pub(super) fn allocated(text: &str, root: &Path) -> String {
    let mut text = text.to_owned();
    if let Ok(staged) = fs::read_to_string(bit_object_import::scope_path(root).join("staged-snaps"))
    {
        for (index, hash) in staged.lines().enumerate() {
            text = text.replace(hash, &format!("ALLOCATED_{index}"));
        }
    }
    text
}

pub(super) fn component() -> Helper {
    let mut helper = component_original();
    // Both command roots relocate the same dependency-cache metadata.
    helper.scopes.local_path = helper.clone_workspace();
    helper
}
