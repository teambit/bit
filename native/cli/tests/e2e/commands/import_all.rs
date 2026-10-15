//! `e2e/commands/import-all.e2e.ts`.

/// Native `bit import` declines `--merge`, `--override` and `--merge=manual` (outside the
/// native import grammar), and `bit import` without ids when the workspace holds an imported
/// model (`commandInboundPrepare: inbound imported model`).
mod known_failures {
    use crate::{
        allow_known_failure,
        helper::{FOO_FIXTURE, Helper, Run},
    };
    use std::{fs, path::PathBuf};

    /// `fixtures.fooFixture` v2, as the e2e file writes it.
    const FOO_V2: &str = "module.exports = function foo() { return 'got foo v2'; };";

    /// A new workspace holding the `.bitmap` of a tagged `bar/foo`, exported when `export`.
    fn bitmap_without_objects(export: bool) -> Helper {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.create_component_bar_foo(FOO_FIXTURE);
        helper.add_component_bar_foo();
        helper.tag_component_bar_foo();
        if export {
            helper.run("export bar/foo");
        }
        let bitmap = fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
        helper.re_init_workspace();
        helper.add_remote_scope();
        fs::write(helper.scopes.local_path.join(".bitmap"), bitmap).unwrap();
        helper
    }

    /// The output of a failed run.
    fn failure(run: &Run) -> String {
        assert!(!run.status.success(), "succeeded:\n{}", run.stdout);
        format!("{}{}", run.stdout, run.stderr)
    }

    /// with a component in bit.map and --merge flag › should throw an error and suggest using
    /// bit checkout reset
    #[test]
    fn merge_without_objects_suggests_checkout_reset() {
        let helper = bitmap_without_objects(true);
        let output = failure(&allow_known_failure!(helper.native_or_known("import --merge")));
        assert!(output.contains("checkout reset"), "{output}");
    }

    /// The workspace of "with components in bit.map when they are modified locally", and its
    /// clone.
    fn modified_locally() -> (Helper, PathBuf) {
        let helper = bitmap_without_objects(true);
        helper.run("checkout reset --all");
        helper.create_component_bar_foo(FOO_V2);
        let clone = helper.clone_workspace();
        (helper, clone)
    }

    /// with components in bit.map when they are modified locally › without any flag › should
    /// not display a warning saying it was unable to import; should display a successful message
    #[test]
    fn import_without_ids_imports_objects() {
        let (helper, _) = modified_locally();
        let output = allow_known_failure!(helper.native_output_or_known("import"));
        assert!(!output.contains("unable to import"), "{output}");
        assert!(output.contains("successfully imported"), "{output}");
    }

    /// with components in bit.map when they are modified locally › with --override flag ›
    /// should throw an error and suggest using bit checkout reset
    #[test]
    fn override_suggests_checkout_reset() {
        let (helper, clone) = modified_locally();
        helper.get_cloned_workspace(&clone);
        let output = failure(&allow_known_failure!(helper.native_or_known("import --override")));
        assert!(output.contains("checkout reset"), "{output}");
    }

    /// with components in bit.map when they are modified locally › with --merge=manual flag ›
    /// should display a successful message; should show them as modified
    #[test]
    fn manual_merge_keeps_the_modification() {
        let (helper, clone) = modified_locally();
        helper.get_cloned_workspace(&clone);
        let remote = &helper.scopes.remote;
        let output = allow_known_failure!(helper.native_output_or_known(&format!(
            "import {remote}/bar/foo --merge=manual"
        )));
        assert!(output.contains("successfully imported"), "{output}");
        let status = helper.run("status");
        assert!(status.contains("modified components"), "{status}");
    }

    /// with components in bit.map when they are modified locally › after tagging › should
    /// display a successful message
    #[test]
    fn manual_merge_after_a_local_tag() {
        let (helper, clone) = modified_locally();
        helper.get_cloned_workspace(&clone);
        helper.tag_without_build("", "");
        let remote = &helper.scopes.remote;
        let output = allow_known_failure!(helper.native_output_or_known(&format!(
            "import {remote}/bar/foo --merge=manual"
        )));
        assert!(output.contains("successfully imported"), "{output}");
    }

    /// with an AUTHORED component which was only tagged but not exported › should not try to
    /// import that component as it was not exported yet
    #[test]
    fn an_unexported_component_is_not_imported() {
        let helper = bitmap_without_objects(false);
        let run = allow_known_failure!(helper.native_or_known("import --merge"));
        if !run.status.success() {
            let output = failure(&run);
            assert!(output.contains("nothing to import"), "{output}");
        }
    }
}
