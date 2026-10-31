//! `e2e/commands/list.e2e.ts`.

mod parity;

use crate::helper::{FOO_FIXTURE, Helper};

/// when a component is created but not tagged › should display "found 0 components"
#[test]
fn a_new_component_is_not_listed() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    let output = helper.native("list --local-scope");
    assert!(output.contains("found 0 components"), "{output}");
}

/// when a component is created and tagged › should display "found 1 components"
#[test]
fn a_tagged_component_is_listed() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    let output = helper.native("list --local-scope");
    assert!(output.contains("found 1 components"), "{output}");
}

mod outdated {
    use super::{FOO_FIXTURE, Helper, parity};
    use crate::helper::{Run, parse};
    use serde_json::Value;

    /// `listLocalScopeParsed('-o')`.
    const OUTDATED: &str = "list --local-scope --json -o";

    fn listed(run: &Run) -> Vec<Value> {
        assert!(run.status.success(), "{}", run.stderr);
        parse(&run.stdout)
            .as_array()
            .unwrap()
            .clone()
    }

    fn entry<'a>(list: &'a [Value], id: &str) -> &'a Value {
        list.iter()
            .find(|item| item["id"] == id)
            .unwrap_or_else(|| panic!("{id} in {list:?}"))
    }

    /// with --outdated flag › when a remote component has a higher version than the local
    /// component › should show that it has a later version in the remote
    #[test]
    fn a_later_remote_version_is_shown() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.create_component_bar_foo(FOO_FIXTURE);
        helper.add_component_bar_foo();
        helper.tag_component_bar_foo();
        crate::helper::remote::publish(&helper);
        helper.re_init_workspace();
        helper.add_remote_scope();
        let remote = &helper.scopes.remote;
        helper.run(&format!("import {remote}/bar/foo@0.0.1"));
        let cloned = helper.clone_workspace();
        helper.re_init_workspace();
        helper.add_remote_scope();
        helper.run(&format!("import {remote}/bar/foo@0.0.1"));
        helper.tag_without_build("bar/foo", "--unmodified");
        crate::helper::remote::publish(&helper);
        helper.get_cloned_workspace(&cloned);
        let list = listed(&parity::compare(&helper, OUTDATED));
        let bar_foo = entry(&list, &format!("{remote}/bar/foo"));
        assert_eq!(bar_foo["remoteVersion"], "0.0.2");
        assert_eq!(bar_foo["localVersion"], "0.0.1");
    }

    /// with --outdated flag › when a remote component has the same version as the local
    /// component › should display the same version for the local and remote
    #[test]
    fn the_same_remote_version_is_shown() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.output_file("bar/baz.js", "");
        helper.run("add bar -i bar/baz");
        helper.tag_without_build("bar/baz", "");
        crate::helper::remote::publish(&helper);
        helper.re_init_workspace();
        helper.add_remote_scope();
        let remote = &helper.scopes.remote;
        helper.run(&format!("import {remote}/bar/baz@0.0.1"));
        let list = listed(&parity::compare(&helper, OUTDATED));
        let bar_baz = entry(&list, &format!("{remote}/bar/baz"));
        assert_eq!(bar_baz["remoteVersion"], bar_baz["localVersion"]);
    }

    /// with --outdated flag › when a component is local only (never exported) › should show
    /// that the component does not have a remote version
    #[test]
    fn a_local_only_component_has_no_remote_version() {
        let helper = Helper::new();
        helper.re_init_workspace_with(false);
        helper.output_file("bar/local", FOO_FIXTURE);
        helper.run("add bar -i bar/local");
        helper.tag_without_build("bar/local", "");
        let list = listed(&parity::compare(&helper, OUTDATED));
        assert_eq!(entry(&list, "my-scope/bar/local")["remoteVersion"], "N/A");
    }
}
