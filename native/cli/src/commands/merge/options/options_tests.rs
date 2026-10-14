use super::parse;

#[test]
fn accepts_the_native_subset() {
    let options = parse(&["-x", "--no-snap"]).unwrap();
    assert!(options.no_snap && options.pattern.is_none());
    assert_eq!(parse(&["one", "-x", "-r", "theirs"]).unwrap().strategy.as_deref(), Some("theirs"));
    assert_eq!(parse(&["**", "-x", "--manual"]).unwrap().pattern.as_deref(), Some("**"));
    assert_eq!(parse(&["-x", "-m", "msg"]).unwrap().message.as_deref(), Some("msg"));
}

#[test]
fn rejects_everything_else() {
    assert!(parse(&["--no-snap"]).is_none(), "without -x an install follows");
    assert!(parse(&["-x", "--no-snap", "-m", "msg"]).is_none());
    assert!(parse(&["-x", "--manual", "-r", "ours"]).is_none());
    assert!(parse(&["-x", "-r", "mine"]).is_none());
    assert!(parse(&["a", "b", "-x"]).is_none());
    assert!(parse(&["A", "-x"]).is_none());
    assert!(parse(&["-x", "--all"]).is_none());
    assert!(parse(&["-x", "--force-ours"]).is_none());
}
