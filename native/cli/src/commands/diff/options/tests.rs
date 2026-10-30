use super::{output_error, parse};

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
    let inline = parse(&["--file=a.ts,b.ts", "--stat=true", "--no-color"]).unwrap();
    assert_eq!(inline.output.files, ["a.ts", "b.ts"]);
    assert!(inline.output.stat);
}

#[test]
fn detects_mutually_exclusive_flags_and_rejects_unimplemented_inputs() {
    for args in [
        &["--files-only", "--configs-only"][..],
        &["--file", "a", "--configs-only"],
        &["--name-only", "--stat"],
    ] {
        let options = parse(args).unwrap();
        assert!(output_error(&options).is_some(), "{args:?}");
    }
    let parent_two = parse(&["one", "1.0.0", "2.0.0", "--parent"]).unwrap();
    assert!(parent_two.versions.parent && parent_two.versions.to.is_some());
    for args in [&["one", "1.0.0", "2.0.0", "3.0.0"][..], &["--file"]] {
        assert!(parse(args).is_none(), "{args:?}");
    }
}
