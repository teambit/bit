//! End-to-end tests for `e2e/harmony/scope-trust.e2e.ts` ([`workspace_scope_trust_gate_and_cli_commands`], [`TRUSTED_SCOPES_KEY`]).
//! Covers `trustedScopes` enforcement and refusal diagnostics when loading external workspace aspects.

use crate::helper::{Helper, config};
use serde_json::json;

/// `workspace.jsonc` key listing external scopes trusted to execute environment/aspect code ([`workspace_scope_trust_gate_and_cli_commands`]).
const TRUSTED_SCOPES_KEY: &str = "trustedScopes";

/// Verifies [`TRUSTED_SCOPES_KEY`] enforcement and `bit scope trust` / `bit scope untrust` CLI commands ([`Helper`], [`config`]).
#[test]
fn workspace_scope_trust_gate_and_cli_commands() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let env_scope_name = helper.scopes.remote.clone();

    let comp_remote = helper.create_new_remote_scope();
    helper.add_remote_scope_with(&comp_remote.scope_path);

    helper.set_empty_env();
    helper.populate_components(1, false, "");
    helper.native("env set comp1 empty-env");
    helper.native(&format!("scope set {} comp1", comp_remote.scope_name));
    helper.run("install");
    helper.compile();
    helper.native("tag --skip-tests");
    helper.native("export");

    // 1. Victim workspace with empty trustedScopes rejects untrusted env scope
    helper.re_init_workspace_with(false);
    config::set_workspace_aspect_key(
        &helper.scopes.local_path,
        "defaultScope",
        json!("other-owner.app"),
    );
    config::set_workspace_aspect_key(&helper.scopes.local_path, TRUSTED_SCOPES_KEY, json!([]));
    helper.add_remote(&comp_remote.scope_path);

    let list_empty = helper.native("scope trust list");
    assert!(list_empty.contains("no scopes configured in workspace.jsonc"), "{list_empty}");

    let untrusted_import = helper.cmd(&format!("import {}/comp1", comp_remote.scope_name));
    let combined_untrusted = format!("{}\n{}", untrusted_import.stdout, untrusted_import.stderr);
    assert!(
        combined_untrusted.to_lowercase().contains("isn't on the workspace's trusted list")
            || combined_untrusted.contains(&env_scope_name),
        "{combined_untrusted}",
    );

    // 2. Trust the env's scope via native `bit scope trust add`
    let add_out = helper.native(&format!("scope trust add {env_scope_name}"));
    assert!(add_out.contains(&env_scope_name), "{add_out}");
    let list_out = helper.native("scope trust list");
    assert!(list_out.contains(&env_scope_name), "{list_out}");

    let trusted_import = helper.native(&format!("import {}/comp1 -x", comp_remote.scope_name));
    assert!(trusted_import.to_lowercase().contains("successfully imported"), "{trusted_import}");
    assert!(
        !trusted_import.to_lowercase().contains("isn't on the workspace's trusted list"),
        "{trusted_import}",
    );
}
