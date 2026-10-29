//! Native e2e coverage for `details`, `globals`, `system`, `version`, `git`, and `scope trust`.

use crate::helper::{Helper, config, parse};
use serde_json::json;
use std::fs;

#[test]
fn version_history_branched_text_matches_node() {
    let helper = super::move_paths::support::workspace(1, true);
    let history = super::move_paths::support::json(&helper, "version-history show comp1 --json");
    let head = helper.get_head("comp1");
    let first = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let second = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    let third = "cccccccccccccccccccccccccccccccccccccccc";
    let graph = json!({"name":"comp1","scope":helper.scopes.remote,"graphCompleteRefs":[],"versions":[
        {"hash":first,"parents":[]},
        {"hash":second,"parents":[first]},
        {"hash":third,"parents":[first]},
        {"hash":head,"parents":[second,third],"squashed":[first],"unrelated":third}
    ]});
    write_history_fixture(&helper, history["hash"].as_str().unwrap(), &graph);
    super::move_paths::support::compare(&helper, "version-history show comp1");
    super::move_paths::support::compare(&helper, "vh show comp1 -s");
    let incomplete = json!({"name":"comp1","scope":helper.scopes.remote,"graphCompleteRefs":[],"versions":[
        {"hash":first,"parents":[second]},
        {"hash":third,"parents":[]},
        {"hash":head,"parents":[first]}
    ]});
    write_history_fixture(&helper, history["hash"].as_str().unwrap(), &incomplete);
    super::move_paths::support::compare(&helper, "version-history show comp1");
}

fn write_history_fixture(helper: &Helper, hash: &str, history: &serde_json::Value) {
    write_scope_fixture(helper, "VersionHistory", hash, history);
}

fn write_scope_fixture(helper: &Helper, kind: &str, hash: &str, value: &serde_json::Value) {
    use flate2::{Compression, write::ZlibEncoder};
    use std::io::Write;
    let body = serde_json::to_vec(value).unwrap();
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    write!(encoder, "{kind} {hash} {}\0", body.len()).unwrap();
    encoder.write_all(&body).unwrap();
    let path = helper.scopes.local_path
        .join(".bit/objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, encoder.finish().unwrap()).unwrap();
}

#[test]
fn version_history_prefers_newest_normal_tag_over_orphans() {
    let helper = super::move_paths::support::workspace(1, true);
    super::move_paths::support::setup(&helper, "version-history build comp1");
    let scope = helper.scopes.local_path.join(".bit");
    let index: serde_json::Value =
        serde_json::from_slice(&fs::read(scope.join("index.json")).unwrap()).unwrap();
    let model_hash = index["components"][0]["hash"].as_str().unwrap();
    let (_, mut model) = bit_object_import::read_scope_object(&scope, model_hash).unwrap().unwrap();
    let head = model["head"]
        .as_str()
        .unwrap()
        .to_owned();
    model["versions"]["0.0.2"] = json!(head);
    model["orphanedVersions"] = json!({"0.0.3":head,"0.0.4":head});
    write_scope_fixture(&helper, "Component", model_hash, &model);
    let result = super::move_paths::support::compare(&helper, "version-history show comp1");
    assert!(result.stdout.contains("main, 0.0.2"));
}

#[test]
fn version_history_linear_text_matches_node() {
    let helper = super::move_paths::support::workspace(1, false);
    super::move_paths::support::tag(&helper);
    helper.output_file("comp1/index.js", "module.exports = () => 'second';\n");
    super::move_paths::support::tag(&helper);
    super::move_paths::support::setup(&helper, "version-history build comp1");
    let result = super::move_paths::support::compare(&helper, "version-history build comp1");
    assert!(result.stdout.contains("no changes"));
    assert!(!result.trace.contains("starting the JavaScript host"));
    super::move_paths::support::compare_ci(&helper, "version-history build comp1", true);
    super::move_paths::support::compare(
        &helper,
        &format!("vh build {}/comp1", helper.scopes.remote),
    );
    let history = super::move_paths::support::json(&helper, "version-history show comp1 --json");
    assert_eq!(
        history["versions"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
    let result = super::move_paths::support::compare(&helper, "version-history show comp1");
    assert!(!result.trace.contains("starting the JavaScript host"));
    super::move_paths::support::compare(&helper, "vh show comp1 --short-hash");
    super::move_paths::support::compare_ci(&helper, "version-history show comp1", true);
    let head = helper.get_head("comp1");
    helper.output_file(
        ".bit/refs/remotes/example/dev",
        &json!([{"id":{"scope":helper.scopes.remote,"name":"comp1"},"head":head}]).to_string(),
    );
    let lane = super::move_paths::support::compare(&helper, "version-history show comp1");
    assert!(lane.stdout.contains("example/dev, main, 0.0.2"));
    super::move_paths::support::compare(&helper, "vh show comp1 -s");
    let first = history["versions"][0]["hash"].as_str().unwrap();
    helper.output_file(
        ".bit/refs/remotes/example/other",
        &json!([{"id":{"scope":helper.scopes.remote,"name":"comp1"},"head":first}]).to_string(),
    );
    let lanes = super::move_paths::support::compare(&helper, "version-history show comp1");
    assert!(lanes.stdout.contains("example/other, 0.0.1"));
    helper.output_file(
        ".bit/refs/remotes/example/other",
        &json!([{"id":{"scope":helper.scopes.remote,"name":"comp1"},"head":head}]).to_string(),
    );
    let shared = super::move_paths::support::compare(&helper, "version-history show comp1");
    assert!(shared.stdout.contains("example/other, example/dev, main, 0.0.2"));
    helper.output_file(
        ".bit/refs/remotes/example/Alpha",
        &json!([{"id":{"scope":helper.scopes.remote,"name":"comp1"},"head":head}]).to_string(),
    );
    let sorted = super::move_paths::support::compare(&helper, "version-history show comp1");
    assert!(sorted.stdout.contains("example/other, example/dev, example/Alpha, main, 0.0.2"));
    helper.output_file(
        ".bit/refs/remotes/example/éclair",
        &json!([{"id":{"scope":helper.scopes.remote,"name":"comp1"},"head":head}]).to_string(),
    );
    super::move_paths::support::compare(&helper, "version-history show comp1");
    helper.output_file(
        ".bit/refs/remotes/another/dev",
        &json!([{"id":{"scope":helper.scopes.remote,"name":"comp1"},"head":head}]).to_string(),
    );
    super::add::support::compare_declined(
        &helper,
        "version-history show comp1",
        normalize_lane_order,
    );
}

fn normalize_lane_order(text: &str) -> String {
    let (prefix, rest) = text.split_once(" (").unwrap();
    let (pointers, suffix) = rest.split_once(") ").unwrap();
    let mut parts = pointers.split(", ").collect::<Vec<_>>();
    assert!(parts.ends_with(&["main", "0.0.2"]));
    parts.truncate(parts.len() - 2);
    parts.sort_unstable();
    assert_eq!(
        parts,
        ["another/dev", "example/Alpha", "example/dev", "example/other", "example/éclair"],
    );
    format!("{prefix} ({}, main, 0.0.2) {suffix}", parts.join(", "))
}

#[test]
fn version_history_text_empty_and_remote_refs_match_node() {
    let helper = super::move_paths::support::workspace(1, true);
    let history = super::move_paths::support::json(&helper, "version-history show comp1 --json");
    let hash = history["hash"].as_str().unwrap();
    let path = helper.scopes.local_path
        .join(".bit/objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    if path.exists() {
        fs::remove_file(path).unwrap();
    }
    super::move_paths::support::compare(&helper, "version-history show comp1");
    helper.output_file(".bit/refs/remotes/example/main", "[]");
    super::move_paths::support::compare(&helper, "version-history show comp1");
    helper.output_file(".bit/refs/remotes/example/dev", "[]");
    helper.output_file(".bit/refs/remotes/example/other", "[]");
    super::move_paths::support::compare(&helper, "version-history show comp1");
}

#[test]
fn version_and_globals_and_system_log_run_natively() {
    let helper = Helper::new();
    helper.re_init_workspace();

    let version_text = helper.native("version");
    assert!(!version_text.trim().is_empty(), "{version_text}");
    let version_json = parse(&helper.native("version --json"));
    assert_eq!(version_json["bit"].as_str(), Some(version_text.trim()), "{version_json}");

    let globals_text = helper.native("globals");
    assert!(globals_text.contains("Global Dir"), "{globals_text}");
    assert!(globals_text.contains("Config Dir"), "{globals_text}");
    let globals_json = parse(&helper.native("globals --json"));
    assert!(globals_json["Global Dir"].is_string(), "{globals_json}");
    assert!(globals_json["Log file"].is_string(), "{globals_json}");

    let log_file = globals_json["Log file"].as_str().unwrap();
    if let Some(parent) = std::path::Path::new(log_file).parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(log_file, "sample debug log line\n").unwrap();
    let system_log = helper.native("system log");
    assert!(system_log.contains("sample debug log line"), "{system_log}");

    let bad_system = helper.native("system unknown-sub");
    assert!(
        bad_system.contains(r#""unknown-sub" is not a subcommand of "system""#),
        "{bad_system}",
    );
}

#[test]
fn details_prints_empty_notice_or_saved_command_details_natively() {
    let helper = Helper::new();
    helper.re_init_workspace();
    let globals = helper.own_global_config("analytics_reporting", "false");

    let empty = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "details",
        &[("BIT_GLOBALS_DIR", globals.as_os_str())],
    );
    assert!(empty.native && empty.status.success(), "{empty:?}");
    assert!(empty.stdout.contains("no details available."), "{}", empty.stdout);

    let details_dir = globals.join("last-command-details");
    fs::create_dir_all(&details_dir).unwrap();
    fs::write(details_dir.join("content"), "detailed line 1\ndetailed line 2").unwrap();
    fs::write(
        details_dir.join("meta.json"),
        json!({
            "command": "switch main",
            "timestamp": "2026-10-20T12:00:00.000Z"
        })
        .to_string(),
    )
    .unwrap();

    let populated = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "details",
        &[("BIT_GLOBALS_DIR", globals.as_os_str())],
    );
    assert!(populated.native && populated.status.success(), "{populated:?}");
    assert!(populated.stdout.contains(r#"details from "bit switch main""#), "{}", populated.stdout);
    assert!(populated.stdout.contains("detailed line 1"), "{}", populated.stdout);
    assert!(
        populated.stdout.contains("(these are details from the last command that provided them)"),
        "{}",
        populated.stdout,
    );
}

#[test]
fn git_subcommands_and_merge_bitmaps_run_natively() {
    let helper = Helper::new();
    helper.re_init_workspace();

    let bad_git = helper.native("git unknown-sub");
    assert!(bad_git.contains(r#""unknown-sub" is not a subcommand of "git""#), "{bad_git}");

    let ancestor = helper.scopes.local_path.join("ancestor.bitmap");
    let current = helper.scopes.local_path.join("current.bitmap");
    let other = helper.scopes.local_path.join("other.bitmap");
    fs::write(&ancestor, "{}\n").unwrap();
    fs::write(
        &current,
        "{\n  \"comp1\": {\n    \"scope\": \"my.scope\",\n    \"version\": \"0.0.1\",\n    \"mainFile\": \"index.js\",\n    \"rootDir\": \"comp1\"\n  }\n}\n",
    )
    .unwrap();
    fs::write(
        &other,
        "{\n  \"comp2\": {\n    \"scope\": \"my.scope\",\n    \"version\": \"0.0.1\",\n    \"mainFile\": \"index.js\",\n    \"rootDir\": \"comp2\"\n  }\n}\n",
    )
    .unwrap();

    let merge_out = helper.native(&format!(
        r#"git merge-bitmaps "{}" "{}" "{}""#,
        ancestor.display(),
        current.display(),
        other.display(),
    ));
    assert!(merge_out.contains("bitmap files merged successfully"), "{merge_out}");
    let merged = config::read_jsonc(&current);
    assert_eq!(merged["comp1"]["version"], "0.0.1");
    assert_eq!(merged["comp2"]["version"], "0.0.1");

    let init_status = std::process::Command::new("git")
        .arg("init")
        .current_dir(&helper.scopes.local_path)
        .output()
        .unwrap();
    assert!(init_status.status.success());
    let driver_out = helper.native("git set-merge-driver");
    assert!(driver_out.contains("git merge driver was set"), "{driver_out}");
    let gitattributes =
        fs::read_to_string(helper.scopes.local_path.join(".gitattributes")).unwrap();
    assert!(gitattributes.contains(".bitmap merge=bitmap-driver"), "{gitattributes}");
}

#[test]
fn scope_trust_and_unrecognized_scope_subcommand_run_natively() {
    let helper = Helper::new();
    helper.re_init_workspace();

    let bad_scope = helper.native("scope unknown-sub");
    assert!(bad_scope.contains(r#""unknown-sub" is not a subcommand of "scope""#), "{bad_scope}");

    let off = helper.native("scope trust");
    assert!(off.contains("scope-trust is off for this workspace."), "{off}");

    let enabled = helper.native("scope trust enable");
    assert!(enabled.contains("scope-trust enabled"), "{enabled}");

    let list_on = helper.native("scope trust list");
    assert!(list_on.contains("scope-trust is on."), "{list_on}");
    assert!(list_on.contains("teambit.*"), "{list_on}");

    let added = helper.native("scope trust add acme.frontend");
    assert!(added.contains("added acme.frontend to trustedScopes"), "{added}");
    let ws = config::read_jsonc(&helper.scopes.local_path.join("workspace.jsonc"));
    assert_eq!(ws["teambit.workspace/workspace"]["trustedScopes"], json!(["acme.frontend"]));

    let removed = helper.native("scope trust remove acme.frontend");
    assert!(removed.contains("removed acme.frontend from trustedScopes"), "{removed}");
    let ws_after_remove = config::read_jsonc(&helper.scopes.local_path.join("workspace.jsonc"));
    assert_eq!(ws_after_remove["teambit.workspace/workspace"]["trustedScopes"], json!([]));

    let disabled = helper.native("scope trust disable");
    assert!(disabled.contains("scope-trust disabled"), "{disabled}");
    let ws_after_disable = config::read_jsonc(&helper.scopes.local_path.join("workspace.jsonc"));
    assert!(ws_after_disable["teambit.workspace/workspace"].get("trustedScopes").is_none());
}

#[test]
fn cat_scope_version_history_and_snap_distance_run_natively() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("snap --skip-tests");
    let first_head = helper.get_head("comp1");
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1 v2';");
    helper.native("snap --skip-tests");
    let second_head = helper.get_head("comp1");

    let cat_scope_table = helper.native("cat-scope");
    assert!(cat_scope_table.contains("Component"), "{cat_scope_table}");
    assert!(cat_scope_table.contains("comp1"), "{cat_scope_table}");

    let cat_scope_json = parse(&helper.native("cat-scope --json"));
    assert!(
        cat_scope_json
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["name"].as_str() == Some("comp1")),
    );

    let cat_scope_extra = parse(&helper.native("cat-scope --json --json-extra"));
    assert!(
        cat_scope_extra
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["hash"].is_string() && item["name"].as_str() == Some("comp1")),
    );

    let vh_json = parse(&helper.native("version-history show comp1 --json"));
    assert_eq!(vh_json["name"].as_str(), Some("comp1"), "{vh_json}");
    let vh_short = parse(&helper.native("vh show comp1 --short-hash --json"));
    assert_eq!(vh_short["name"].as_str(), Some("comp1"), "{vh_short}");
    assert!(vh_short["hash"].is_string(), "{vh_short}");

    let vh_bad = helper.native("version-history unknown-sub");
    assert!(
        vh_bad.contains(r#""unknown-sub" is not a subcommand of "version-history""#),
        "{vh_bad}",
    );

    let dist_out = helper.native(&format!("snap-distance comp1 {first_head} {second_head}"));
    let dist_body = dist_out
        .find('{')
        .map_or(dist_out.as_str(), |idx| &dist_out[idx..]);
    let dist_json = parse(dist_body);
    assert_eq!(dist_json["commonSnapBeforeDiverge"]["hash"].as_str(), Some(first_head.as_str()));
    assert_eq!(dist_json["snapsOnSourceOnly"], json!([]));
    assert_eq!(dist_json["snapsOnTargetOnly"], json!([{ "hash": second_head }]));
}
