//! `e2e/harmony/lanes/lanes-with-issues.e2e.ts`.

use crate::{
    allow_known_failure,
    helper::{Helper, parse, remote},
};
use std::fs;

fn populate_three(helper: &Helper, suffix: &str) {
    for index in 1..=3 {
        helper.output_file(
            &format!("comp{index}/index.js"),
            &format!("module.exports = () => 'comp{index}{suffix}';"),
        );
        let _ = helper.cmd(&format!("add comp{index}"));
    }
}

mod known_failures {
    use super::{Helper, allow_known_failure, fs, parse, populate_three, remote};

    /// lanes with various issues › issue - object of head of main is missing from the filesystem and remote › bit diff diff should not throw
    /// lanes with various issues › issue - object of head of main is missing from the filesystem and remote › bit diff main should not throw
    #[test]
    fn issue_object_of_head_of_main_is_missing_from_the_filesystem_and_remote() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        populate_three(&helper, "");
        helper.run("tag --unmodified --ignore-issues *");
        let comp2_log = parse(&helper.native("log comp2 --json"));
        let comp2_head = comp2_log[0]["hash"]
            .as_str()
            .unwrap()
            .to_owned();
        remote::publish(&helper);
        helper.native("lane create dev");
        populate_three(&helper, "v3");
        helper.run("snap --unmodified --ignore-issues *");
        remote::publish(&helper);

        let rel_object = format!("objects/{}/{}", &comp2_head[..2], &comp2_head[2..]);
        let _ = fs::remove_file(helper.scopes.local_path.join(".bit").join(&rel_object));
        let _ = fs::remove_file(helper.scopes.remote_path.join(&rel_object));

        let output = allow_known_failure!(helper.native_output_or_known("lane diff"));
        assert!(output.contains("Diff failed on the following component(s)"), "{output}");
        assert!(output.contains("was not found on the filesystem"), "{output}");

        let diff_main = allow_known_failure!(helper.native_output_or_known("lane diff main"));
        assert!(diff_main.contains("Diff failed on the following component(s)"), "{diff_main}");
    }
}
