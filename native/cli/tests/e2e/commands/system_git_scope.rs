//! Native e2e coverage for `details`, `globals`, `system`, `version`, `git`, and `scope trust`.

use crate::helper::{Helper, config, parse};
use serde_json::json;
use std::fs;

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
