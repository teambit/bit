use super::{ExistingEntries, InstallOptions, Parsed, parse};
use indexmap::IndexMap;

fn options(args: &[&str]) -> InstallOptions {
    let argv: Vec<String> = args
        .iter()
        .map(ToString::to_string)
        .collect();
    match parse(&argv).expect("parse") {
        Parsed::Install(options) => *options,
        Parsed::Help => panic!("unexpected help"),
    }
}

#[test]
fn parses_packages_and_switches() {
    let parsed = options(&["in", "lodash", "react@18", "-u", "--skip-compile", "--skipImport"]);
    assert_eq!(parsed.packages, ["lodash", "react@18"]);
    assert!(parsed.update);
    assert!(parsed.skip_compile);
    assert!(parsed.skip_import);
    assert!(!parsed.skip_dedupe);
}

#[test]
fn parses_values_and_aliases() {
    let parsed = options(&["install", "-t", "peer", "--save-prefix=~", "-a", "is-odd"]);
    assert_eq!(parsed.lifecycle_type.as_deref(), Some("peer"));
    assert_eq!(parsed.save_prefix.as_deref(), Some("~"));
    assert!(parsed.add_missing_deps);
    assert_eq!(parsed.packages, ["is-odd"]);
}

#[test]
fn no_optional_is_a_literal_flag() {
    assert!(options(&["install", "--no-optional"]).no_optional);
    assert!(!options(&["install", "--no-optional=false"]).no_optional);
}

#[test]
fn disallow_scripts_wins() {
    let parsed = options(&["install", "--allow-scripts", "a, b,", "--disallow-scripts=b"]);
    let expected: IndexMap<String, bool> = [("a".into(), true), ("b".into(), false)].into();
    assert_eq!(parsed.allow_scripts, Some(expected));
}

#[test]
fn add_missing_peers_installs_peers() {
    assert_eq!(options(&["install", "--add-missing-peers"]).lifecycle(), "peer");
    assert_eq!(options(&["install"]).lifecycle(), "runtime");
}

#[test]
fn keeps_package_manager_args_and_log() {
    let parsed = options(&["install", "--log", "--", "--foo", "bar"]);
    assert_eq!(parsed.log.as_deref(), Some(""));
    assert_eq!(parsed.package_manager_args, ["--foo", "bar"]);
}

#[test]
fn help_and_unknown_flags() {
    let argv = |args: &[&str]| {
        args.iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>()
    };
    assert_eq!(parse(&argv(&["install", "--help"])).unwrap(), Parsed::Help);
    assert!(parse(&argv(&["install", "--bogus"])).is_err());
    assert!(parse(&argv(&["status"])).is_err());
}

#[test]
fn switches_take_a_following_boolean() {
    let parsed = options(&["install", "--skipCompile", "true", "--skip-import", "false", "lodash"]);
    assert!(parsed.skip_compile);
    assert!(!parsed.skip_import);
    assert_eq!(parsed.packages, ["lodash"]);
}

#[test]
fn the_command_asks_before_leaving_external_mode() {
    let parsed = options(&["install"]);
    assert!(parsed.external_prompt);
    assert!(!parsed.programmatic);
    assert_eq!(parsed.existing_entries, ExistingEntries::Update);
}

#[test]
fn programmatic_options_deserialize_from_partial_json() {
    let parsed: InstallOptions = serde_json::from_str(
        r#"{ "programmatic": true, "skipImport": true, "existingEntries": "skip", "skipPrune": true }"#,
    )
    .unwrap();
    assert!(parsed.programmatic && parsed.skip_import && parsed.skip_prune);
    assert_eq!(parsed.existing_entries, ExistingEntries::Skip);
    assert!(!parsed.external_prompt);
    assert!(parsed.packages.is_empty());
}
