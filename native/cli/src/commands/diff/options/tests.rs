use super::parse;

#[test]
fn accepts_workspace_diff_output_modes() {
    let options = parse(&["consumer", "--file", "src/index.js,index.js", "--stat"]).unwrap();
    assert_eq!(options.pattern.as_deref(), Some("consumer"));
    assert_eq!(options.output.files, ["src/index.js", "index.js"]);
    assert!(options.output.stat);
    assert!(parse(&["--json", "--name-only"]).unwrap().output.json);
    assert_eq!(parse(&["one", "0.0.1"]).unwrap().versions.from.as_deref(), Some("0.0.1"));
    let to_version = parse(&["one", "0.0.1", "0.0.2"]).unwrap().versions.to;
    assert_eq!(to_version.as_deref(), Some("0.0.2"));
    assert!(parse(&["one", "--parent"]).unwrap().versions.parent);
    assert!(parse(&["one", "1.0.0", "-p"]).unwrap().versions.parent);
}

#[test]
fn rejects_ambiguous_or_unimplemented_inputs() {
    for args in [
        &["one", "1.0.0", "2.0.0", "3.0.0"][..],
        &["--files-only", "--configs-only"],
        &["--file", "a", "--configs-only"],
        &["--name-only", "--stat"],
        &["one", "1.0.0", "2.0.0", "--parent"],
        &["--file"],
    ] {
        assert!(parse(args).is_none(), "{args:?}");
    }
}
