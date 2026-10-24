use super::{Action, parse_options, replace_package_name};
use std::ffi::OsString;

fn parse(words: &[&str]) -> Option<Action> {
    let args = words
        .iter()
        .map(OsString::from)
        .collect::<Vec<_>>();
    parse_options(&args)
}

#[test]
fn parses_dependency_name_and_unrecognized_subcommands() {
    assert_eq!(
        parse(&["refactor", "dependency-name", "@scope/old", "new-comp"]),
        Some(Action::DependencyName {
            old_id: "@scope/old".to_owned(),
            new_id: "new-comp".to_owned(),
        }),
    );
    assert_eq!(
        parse(&["refactor", "unknown-sub"]),
        Some(Action::Unrecognized("unknown-sub".to_owned())),
    );
    assert_eq!(parse(&["refactor"]), None);
    assert_eq!(parse(&["refactor", "--help"]), None);
    assert_eq!(parse(&["refactor", "dependency-name", "only-one"]), None);
}

#[test]
fn replaces_single_double_tilde_and_subpath_package_imports() {
    let source = r#"
import a from '@scope/old';
import b from "@scope/old/sub/path";
@import '~@scope/old/styles.scss';
const keep = '@scope/older';
"#;
    let replaced =
        replace_package_name(source, "@scope/old", "@scope/new").ok().unwrap_or_default();
    assert!(replaced.contains("from '@scope/new';"));
    assert!(replaced.contains(r#"from "@scope/new/sub/path";"#));
    assert!(replaced.contains("'~@scope/new/styles.scss'"));
    assert!(replaced.contains("'@scope/older'"));
}
