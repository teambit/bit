//! `e2e/functionalities/repository-hooks-aspects.e2e.ts`.

use crate::helper::Helper;

/// - `repository-hooks-aspects › export to remote scope with aspect-based manipulation hooks › when tagging should run the on pre persist hook, then when loading, should run the on pre read hook`
#[test]
fn repository_hooks_aspect_use_and_tag() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_aspect("repository-hooks-aspect");
    let aspect_id = format!("{}/repository-hooks-aspect", helper.scopes.remote);
    let use_out = helper.native(&format!("use {aspect_id}"));
    assert!(use_out.contains(&aspect_id), "{use_out}");
    let ws = helper.read_workspace_jsonc();
    assert!(ws.get(&aspect_id).is_some(), "{ws}");
}
