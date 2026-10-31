//! `e2e/harmony/use.e2e.ts`.

use crate::helper::Helper;
use std::fs;

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
