use super::support::{command, compare_stashes, workspace, write_both};
use std::fs;
#[test]
fn aliases_messages_explicit_ids_and_empty_operations_match_node() {
    let helper = workspace();
    let oracle = helper.clone_workspace();
    command(&helper, &oracle, "stash list");
    command(&helper, &oracle, "stash s --message empty");
    assert!(!helper.scopes.local_path.join(".bit/stash").exists());
    write_both(&helper, &oracle, "comp1/index.js", "console.log('first');\n");
    command(&helper, &oracle, r#"stash s -m "first message""#);
    write_both(&helper, &oracle, "comp1/index.js", "console.log('second');\n");
    command(&helper, &oracle, r#"stash save --message "second message""#);
    compare_stashes(&helper.scopes.local_path, &oracle);
    command(&helper, &oracle, "stash list");
    command(&helper, &oracle, "stash pop stash-1 --force-theirs");
    let restored = fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap();
    assert_eq!(restored, fs::read(oracle.join("comp1/index.js")).unwrap());
    let expected =
        if cfg!(windows) { "console.log('first');\r\n" } else { "console.log('first');\n" };
    assert_eq!(restored, expected.as_bytes());
    assert!(helper.scopes.local_path.join(".bit/stash/stash-2.json").exists());
}
#[test]
fn forced_and_named_merge_strategies_preserve_local_and_stashed_files() {
    for strategy in ["--force-ours", "--force-theirs", "--auto-merge-resolve ours", "-r theirs"] {
        let helper = workspace();
        let oracle = helper.clone_workspace();
        write_both(&helper, &oracle, "comp1/index.js", "console.log('stashed');\n");
        command(&helper, &oracle, "stash save");
        write_both(&helper, &oracle, "comp1/index.js", "console.log('local');\n");
        command(&helper, &oracle, &format!("stash load {strategy}"));
        assert_eq!(
            fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap(),
            fs::read(oracle.join("comp1/index.js")).unwrap(),
        );
        assert!(!helper.scopes.local_path.join(".bit/stash/stash-1.json").exists());
    }
}
#[test]
fn empty_load_and_invalid_strategy_errors_match_the_published_cli() {
    let helper = workspace();
    let oracle = helper.clone_workspace();
    for error in [
        "stash load",
        "stash load --force-ours --force-theirs",
        "stash load --auto-merge-resolve invalid",
    ] {
        command(&helper, &oracle, error);
    }
}
#[test]
fn double_digit_stash_names_keep_the_published_lexical_latest_selection() {
    let helper = workspace();
    let oracle = helper.clone_workspace();
    for number in 1..=11 {
        write_both(
            &helper,
            &oracle,
            "comp1/index.js",
            &format!("console.log('stash {number}');\n"),
        );
        command(&helper, &oracle, "stash save");
    }
    compare_stashes(&helper.scopes.local_path, &oracle);
    command(&helper, &oracle, "stash list");
    command(&helper, &oracle, "stash load");
    let restored = fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap();
    assert_eq!(restored, fs::read(oracle.join("comp1/index.js")).unwrap());
    let expected =
        if cfg!(windows) { "console.log('stash 9');\r\n" } else { "console.log('stash 9');\n" };
    assert_eq!(restored, expected.as_bytes());
    assert!(helper.scopes.local_path.join(".bit/stash/stash-10.json").exists());
}
#[test]
fn a_following_flag_is_not_consumed_as_a_message_or_strategy() {
    let helper = workspace();
    let oracle = helper.clone_workspace();
    write_both(&helper, &oracle, "comp1/index.js", "console.log('must stay modified');\n");
    let before = super::support::controls(&helper.scopes.local_path);
    for malformed in ["stash save -m --include-new", "stash load -r --force-ours"] {
        let actual = helper.cmd(malformed);
        let expected = super::support::node(&oracle, malformed);
        assert!(!actual.native, "{}", actual.trace);
        assert!(!actual.status.success());
        assert_eq!(actual.status.code(), expected.status.code());
        assert_eq!(actual.stdout, expected.stdout);
        assert_eq!(actual.stderr, expected.stderr);
        assert_eq!(super::support::controls(&helper.scopes.local_path), before);
        assert!(!helper.scopes.local_path.join(".bit/stash/stash-1.json").exists());
        assert_eq!(
            fs::read_to_string(helper.scopes.local_path.join("comp1/index.js")).unwrap(),
            "console.log('must stay modified');\n",
        );
    }
}

#[test]
fn ci_save_and_load_hide_status_lines_like_node() {
    use crate::helper::Helper;
    use std::ffi::OsStr;
    let helper = workspace();
    let oracle = helper.clone_workspace();
    write_both(&helper, &oracle, "comp1/index.js", "console.log('CI stash');\n");
    for command in ["stash save", "stash list", "stash load"] {
        let actual =
            Helper::cmd_in_with(&helper.scopes.local_path, command, &[("CI", OsStr::new("1"))]);
        let expected = Helper::cmd_in_with(
            &oracle,
            command,
            &[("CI", OsStr::new("1")), ("BIT_NATIVE", OsStr::new("off"))],
        );
        assert!(actual.native, "{}", actual.trace);
        assert_eq!(actual.status.code(), expected.status.code());
        assert_eq!(actual.stdout, expected.stdout);
        assert_eq!(actual.stderr, expected.stderr);
        compare_stashes(&helper.scopes.local_path, &oracle);
    }
}
