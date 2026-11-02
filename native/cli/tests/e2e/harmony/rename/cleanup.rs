//! Moving an unversioned component deletes its entire old root directory, including
//! ignored bytes ([`IGNORED_SECRET_PATH`]), unless `--preserve` is passed ([`relocated_new_component_removes_ignored_files_and_nested_empty_directories`]).
use crate::commands::move_paths::support::{self, bitmap, successful};
use std::fs;

/// Relative path of the gitignored file inside `comp1` used to test directory cleanup on `bit rename`.
const IGNORED_SECRET_PATH: &str = "comp1/private/secret.txt";

/// Verifies that relocating a new component removes ignored files and empty directories unless `--preserve` is passed.
#[test]
fn relocated_new_component_removes_ignored_files_and_nested_empty_directories() {
    for flag in ["", "--preserve"] {
        let helper = support::workspace(1, false);
        super::lanes::delay_new(&helper, &format!("{}/comp2", helper.scopes.remote));
        helper.output_file(".bitignore", "comp1/private/**\n");
        helper.output_file(IGNORED_SECRET_PATH, "ignored source bytes\n");
        fs::create_dir_all(helper.scopes.local_path.join("comp1/empty/deep")).unwrap();
        successful(&helper, &format!("rename comp1 comp2 {flag}"));
        if flag == "--preserve" {
            assert!(helper.scopes.local_path.join("comp1/private/secret.txt").is_file());
            assert!(helper.scopes.local_path.join("comp1/empty/deep").is_dir());
            continue;
        }
        assert!(!helper.scopes.local_path.join("comp1").exists());
        let map = bitmap(&helper);
        let target = helper.scopes.local_path.join(map["comp2"]["rootDir"].as_str().unwrap());
        assert!(!target.join("private/secret.txt").exists());
        assert!(!target.join("empty").exists());
    }
}
