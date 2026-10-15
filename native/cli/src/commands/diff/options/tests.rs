use super::parse;

#[test]
fn accepts_workspace_diff_output_modes() {
    let options = parse(&["consumer", "--file", "src/index.js,index.js", "--stat"]).unwrap();
    assert_eq!(options.pattern.as_deref(), Some("consumer"));
    assert_eq!(options.files, ["src/index.js", "index.js"]);
    assert!(options.stat);
    assert!(parse(&["--json", "--name-only"]).unwrap().json);
}

#[test]
fn rejects_ambiguous_or_unimplemented_inputs() {
    for args in [
        &["one", "two"][..],
        &["--files-only", "--configs-only"],
        &["--file", "a", "--configs-only"],
        &["--name-only", "--stat"],
        &["--parent"],
        &["--file"],
    ] {
        assert!(parse(args).is_none(), "{args:?}");
    }
}
