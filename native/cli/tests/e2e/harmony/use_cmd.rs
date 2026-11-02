//! End-to-end tests for `e2e/harmony/use.e2e.ts` ([`create_aspect`], [`when_the_aspect_is_new_should_not_throw_an_error`]).
//! Verifies that `bit use` registers new local aspects in `workspace.jsonc` without throwing errors.

use crate::helper::Helper;
use std::fs;

/// Creates a minimal local aspect component named `name` and assigns it the `teambit.harmony/aspect` env.
fn create_aspect(helper: &Helper, name: &str) {
    let remote = &helper.scopes.remote;
    let dir = format!("{remote}/{name}");
    helper.output_file(&format!("{dir}/index.ts"), "export default {};\n");
    helper.run(&format!("add {dir} -i {name}"));
    helper.run(&format!("envs set {name} teambit.harmony/aspect"));
}

/// bit use command › when the aspect is new › should not throw an error
#[test]
fn when_the_aspect_is_new_should_not_throw_an_error() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    create_aspect(&helper, "my-aspect");
    let aspect_id = format!("{}/my-aspect", helper.scopes.remote);
    let output = helper.native(&format!("use {aspect_id}"));
    assert!(output.contains("workspace.jsonc updated!"), "{output}");
    let ws_content = fs::read_to_string(helper.scopes.local_path.join("workspace.jsonc")).unwrap();
    assert!(ws_content.contains(&aspect_id), "{ws_content}");
}
