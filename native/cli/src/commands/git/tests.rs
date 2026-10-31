use super::{Chalk, Parsed, format_unrecognized, merge_bitmap_contents, parse_args};
use std::ffi::OsString;

#[test]
fn parses_git_subcommands_and_flags() {
    assert_eq!(
        parse_args(&[
            OsString::from("git"),
            OsString::from("merge-bitmaps"),
            OsString::from("anc"),
            OsString::from("cur"),
            OsString::from("oth"),
        ]),
        Some(Parsed::MergeBitmaps { current: "cur".to_owned(), other: "oth".to_owned() }),
    );
    assert_eq!(
        parse_args(&[
            OsString::from("git"),
            OsString::from("set-merge-driver"),
            OsString::from("--no-color=false"),
        ]),
        Some(Parsed::SetMergeDriver { global: false }),
    );
    assert_eq!(
        parse_args(&[OsString::from("git"), OsString::from("smd"), OsString::from("-g")]),
        Some(Parsed::SetMergeDriver { global: true }),
    );
    assert_eq!(
        parse_args(&[
            OsString::from("git"),
            OsString::from("smd"),
            OsString::from("--global=false"),
        ]),
        Some(Parsed::SetMergeDriver { global: false }),
    );
    assert_eq!(
        parse_args(&[OsString::from("git"), OsString::from("smd"), OsString::from("--no-global")]),
        None,
    );
    assert_eq!(
        parse_args(&[OsString::from("git"), OsString::from("unknown")]),
        Some(Parsed::Unrecognized("unknown".to_owned())),
    );
    assert_eq!(parse_args(&[OsString::from("git")]), None);
    assert_eq!(parse_args(&[OsString::from("git"), OsString::from("--help")]), None);
}

#[test]
fn merges_bitmap_contents_across_strategies_and_detects_conflicts() {
    let current = r#"{
    "comp2": { "version": "0.0.1" },
    "comp1": { "version": "0.0.1" },
    "$schema-version": "17.0.0"
}"#;
    let other = r#"{
    "comp1": { "version": "0.0.2" },
    "comp3": { "version": "0.0.1" },
    "$schema-version": "17.0.0"
}"#;
    let err = merge_bitmap_contents(current, other, "manual").unwrap_err();
    assert!(err.to_string().contains("conflict merging Bitmap"));

    let ours = merge_bitmap_contents(current, other, "ours").unwrap();
    let ours_json: serde_json::Value =
        serde_json::from_str(&ours[ours.find('{').unwrap()..]).unwrap();
    assert_eq!(ours_json["comp1"]["version"], "0.0.1");
    assert_eq!(ours_json["comp2"]["version"], "0.0.1");
    assert_eq!(ours_json["comp3"]["version"], "0.0.1");
    assert_eq!(
        ours_json
            .as_object()
            .unwrap()
            .keys()
            .next_back()
            .unwrap(),
        "$schema-version",
    );

    let theirs = merge_bitmap_contents(current, other, "theirs").unwrap();
    let theirs_json: serde_json::Value =
        serde_json::from_str(&theirs[theirs.find('{').unwrap()..]).unwrap();
    assert_eq!(theirs_json["comp1"]["version"], "0.0.2");

    assert_eq!(
        format_unrecognized("foo", Chalk::new(false)),
        r#""foo" is not a subcommand of "git", please run "bit git --help" to list the subcommands"#,
    );
}
