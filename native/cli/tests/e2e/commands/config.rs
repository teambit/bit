//! Port of `e2e/commands/config.e2e.ts`.

use crate::helper::{Helper, Run, setup};
use serde_json::Value;

fn run_config(helper: &Helper, command: &str) -> Run {
    let globals = helper.scopes.e2e_dir.join("globals");
    if !globals.exists() {
        setup::copy_dir(&setup::shared().root.join("globals"), &globals);
    }
    let out = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_GLOBALS_DIR", globals.as_os_str())],
    );
    assert!(out.native, "{command}: {}", out.trace);
    assert!(out.status.success(), "{command} failed:\n{}\n{}", out.stdout, out.stderr);
    out
}

fn list_config_locally(helper: &Helper, origin: &str) -> Value {
    let out = run_config(helper, &format!("config list --origin {origin} --json"));
    serde_json::from_str(&out.stdout).unwrap()
}

#[test]
fn set_get_and_delete_configs() {
    let helper = Helper::new();
    helper.re_init_workspace();
    let set_output = run_config(&helper, "config set conf.key conf.value");
    assert!(set_output.stdout.contains("added configuration successfully\n"));

    let get_output = run_config(&helper, "config get conf.key");
    assert!(get_output.stdout.contains("conf.value\n"));

    let del_output = run_config(&helper, "config del conf.key");
    assert!(del_output.stdout.contains("deleted successfully\n"));

    let conf_val = run_config(&helper, "config get conf.key");
    assert!(!conf_val.stdout.contains("conf.value"));
}

#[test]
fn saving_config_in_the_local_workspace() {
    let helper = Helper::new();
    helper.re_init_workspace();
    run_config(&helper, "config set local.ws hello-ws --local-track");

    let list = list_config_locally(&helper, "workspace");
    assert!(list.get("local.ws").is_some(), "{list}");

    let val = run_config(&helper, "config get local.ws");
    assert!(val.stdout.contains("hello-ws"));

    run_config(&helper, "config del local.ws");
    let list_after = list_config_locally(&helper, "workspace");
    assert!(list_after.get("local.ws").is_none(), "{list_after}");

    let val_after = run_config(&helper, "config get local.ws");
    assert!(!val_after.stdout.contains("hello-ws"));

    run_config(&helper, "config set shared-conf global-val");
    run_config(&helper, "config set shared-conf ws-val --local-track");
    let shared = run_config(&helper, "config get shared-conf");
    assert!(shared.stdout.contains("ws-val"));
    assert!(!shared.stdout.contains("global-val"));
}

#[test]
fn saving_config_in_the_local_scope() {
    let helper = Helper::new();
    helper.re_init_workspace();
    run_config(&helper, "config set local.scope hello-scope --local");

    let list = list_config_locally(&helper, "scope");
    assert!(list.get("local.scope").is_some(), "{list}");

    let val = run_config(&helper, "config get local.scope");
    assert!(val.stdout.contains("hello-scope"));

    run_config(&helper, "config del local.scope");
    let list_after = list_config_locally(&helper, "scope");
    assert!(list_after.get("local.scope").is_none(), "{list_after}");

    let val_after = run_config(&helper, "config get local.scope");
    assert!(!val_after.stdout.contains("hello-scope"));

    run_config(&helper, "config set shared-conf global-val");
    run_config(&helper, "config set shared-conf scope-val --local");
    let shared = run_config(&helper, "config get shared-conf");
    assert!(shared.stdout.contains("scope-val"));
    assert!(!shared.stdout.contains("global-val"));
}
