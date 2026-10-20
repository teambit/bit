//! `e2e/flows/bitmap-deleted.e2e.ts`.

use crate::{
    allow_known_failure,
    helper::{FOO_FIXTURE, Helper},
};

/// user deleted only .bitmap file leaving the objects in place › tagging a component, then, deleting .bitmap file › bit init --force › should init successfully
#[test]
fn tagging_a_component_then_deleting_bitmap_file_init_force() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    helper.delete_path(".bitmap");

    let force_out = helper.native("init --force");
    assert!(force_out.contains("successfully"), "{force_out}");
}

mod known_failures {
    use super::{FOO_FIXTURE, Helper, allow_known_failure};

    /// user deleted only .bitmap file leaving the objects in place › tagging a component, then, deleting .bitmap file › bit init › should throw an error
    #[test]
    fn tagging_a_component_then_deleting_bitmap_file_init() {
        let helper = Helper::new();
        helper.re_init_workspace();
        helper.create_component_bar_foo(FOO_FIXTURE);
        helper.add_component_bar_foo();
        helper.tag_component_bar_foo();
        helper.delete_path(".bitmap");

        let init_run = allow_known_failure!(helper.native_or_known("init"));
        assert!(!init_run.status.success());
        let init_err = format!("{}{}", init_run.stdout, init_run.stderr);
        assert!(init_err.contains("unable to init a bit workspace"), "{init_err}");
    }
}
