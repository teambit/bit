//! Related merged components are resolved together by the retained snapshot lifecycle.
use crate::helper::{Helper, config, parse};
use serde_json::Value;
use std::{ffi::OsStr, fs, path::Path};

fn divergent(mixed: bool) -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    if mixed {
        let source = fs::read_to_string(helper.scopes.local_path.join("comp1/index.js")).unwrap();
        helper.output_file(
            "comp1/index.js",
            &format!("// base start\n\n{source}\n\n// base end\n"),
        );
        helper.output_file("comp2/index.js", "module.exports = () => 'base';\n");
    }
    helper.tag_without_build("", "--message first");
    crate::helper::remote::publish(&helper);
    helper.run("lane create cascade");
    incoming(&helper, mixed);
    helper.run("snap --message incoming");
    helper.run("switch main --skip-fetch -x");
    current(&helper, mixed);
    helper.run("snap --message current");
    helper
}

fn incoming(helper: &Helper, mixed: bool) {
    for component in ["comp1", "comp2"] {
        if mixed && component == "comp2" {
            helper.output_file("comp2/index.js", "module.exports = () => 'incoming';\n");
        } else {
            helper.append_file(&format!("{component}/index.js"), "\n// incoming\n");
        }
    }
}

fn current(helper: &Helper, mixed: bool) {
    for component in ["comp1", "comp2"] {
        let path = helper.scopes.local_path.join(component).join("index.js");
        if mixed && component == "comp2" {
            fs::write(&path, "module.exports = () => 'current';\n").unwrap();
        } else {
            fs::write(&path, format!("// current\n{}", fs::read_to_string(&path).unwrap()))
                .unwrap();
        }
    }
}

#[test]
fn automatic_merge_resolves_changed_dependencies_in_one_snapshot() {
    let helper = divergent(false);
    let oracle = helper.clone_workspace();
    let command = "lane merge cascade --no-squash --auto-merge-resolve theirs --message merged -x";
    let node = Helper::cmd_in_with(&oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(command);
    assert_eq!(native.status.code(), node.status.code(), "{} {}", native.stderr, node.stderr);
    assert!(node.status.success(), "{} {}", node.stdout, node.stderr);
    assert_eq!(native.stderr, node.stderr);
    let actual = hashes(&helper.scopes.local_path);
    let expected = hashes(&oracle);
    assert_eq!(
        super::stable(&normalize(&native.stdout, &actual)),
        super::stable(&normalize(&node.stdout, &expected)),
    );
    for component in ["comp1", "comp2"] {
        let id = format!("{}/{component}", helper.scopes.remote);
        assert_eq!(
            normalize(&version(&helper.scopes.local_path, &id).to_string(), &actual),
            normalize(&version(&oracle, &id).to_string(), &expected),
        );
        let relative = format!("{component}/index.js");
        assert_eq!(
            fs::read(helper.scopes.local_path.join(&relative)).unwrap(),
            fs::read(oracle.join(&relative)).unwrap(),
        );
        assert_eq!(
            helper.scopes.local_path
                .join(component)
                .join("package.json")
                .exists(),
            oracle
                .join(component)
                .join("package.json")
                .exists(),
        );
    }
}

fn hashes(root: &Path) -> Vec<String> {
    let bitmap = config::read_jsonc(&root.join(".bitmap"));
    ["comp1", "comp2"]
        .map(|component| {
            bitmap[component]["version"]
                .as_str()
                .unwrap()
                .to_owned()
        })
        .to_vec()
}

fn normalize(text: &str, hashes: &[String]) -> String {
    hashes
        .iter()
        .enumerate()
        .fold(text.to_owned(), |text, (index, hash)| {
            text.replace(hash, &format!("NEW_SNAP_{index}"))
        })
}

pub(super) fn version(root: &Path, id: &str) -> Value {
    let output = Helper::cmd_in_with(
        root,
        &format!("cat-component {id}@latest --json"),
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(output.status.success(), "{} {}", output.stdout, output.stderr);
    let mut version = parse(&output.stdout);
    version
        .as_object_mut()
        .unwrap()
        .remove("hash");
    version
        .as_object_mut()
        .unwrap()
        .remove("batchId");
    version["log"]
        .as_object_mut()
        .unwrap()
        .remove("date");
    for entry in version["modified"]
        .as_array_mut()
        .into_iter()
        .flatten()
    {
        entry
            .as_object_mut()
            .unwrap()
            .remove("date");
    }
    if let Some(reference) = version["flattenedEdgesRef"].as_str() {
        let graph = Helper::cmd_in_with(
            root,
            &format!("cat-object {reference} -s"),
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        version["flattenedEdgesRef"] = parse(&graph.stdout);
    }
    version
}

#[test]
fn mixed_source_conflicts_materialize_all_components_without_partial_snapshots() {
    let helper = divergent(true);
    let before = hashes(&helper.scopes.local_path);
    super::compare(&helper, "lane merge cascade --no-squash --manual --message merged -x");
    assert_eq!(hashes(&helper.scopes.local_path), before);
    assert!(
        !fs::read_to_string(helper.scopes.local_path.join("comp1/index.js"))
            .unwrap()
            .contains("<<<<<<<"),
    );
    assert!(
        fs::read_to_string(helper.scopes.local_path.join("comp2/index.js"))
            .unwrap()
            .contains("<<<<<<<"),
    );
}

#[test]
fn failed_merge_snapshot_reports_missing_manual_packages_after_materialization() {
    let helper = divergent(false);
    crate::helper::remote::publish(&helper);
    helper.run("switch cascade --skip-fetch -x");
    helper.run("deps set comp2 merge-missing-package@1.0.0");
    helper.run("snap comp2 --ignore-issues '*' --message missing-policy");
    crate::helper::remote::publish(&helper);
    helper.run("switch main --skip-fetch -x");
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.component/issues",
        serde_json::json!({"ignoreIssues":[]}),
    );
    super::compare(
        &helper,
        "lane merge cascade --no-squash --auto-merge-resolve theirs --message merged -x",
    );
    super::compare(&helper, "merge --resolve --message unresolved-packages -x");
}
