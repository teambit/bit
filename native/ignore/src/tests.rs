use crate::{Compiler, Ignore, Rule, UnsupportedPattern};
use pretty_assertions::assert_eq;

/// `[pattern, [[source, negative]...]]` produced by node-ignore 3.3.10, one
/// `ignore().add([pattern])` per entry in this order within a single
/// process, so its regex cache carries over between entries exactly like
/// [`Compiler`]'s. The last entry is `ignore().add(['zzz']).add(['!zzz'])`.
const FIXTURES: &str = include_str!("node_ignore_3_3_10.json");

#[test]
fn matches_node_ignore_sources_and_cache() {
    let fixtures: Vec<(String, Vec<(String, bool)>)> = serde_json::from_str(FIXTURES).unwrap();
    let mut compiler = Compiler::new();
    for (pattern, expected) in fixtures {
        let mut ignore = Ignore::new();
        if pattern == "<cache>" {
            ignore
                .add_with(&mut compiler, ["zzz"])
                .unwrap();
            ignore
                .add_with(&mut compiler, ["!zzz"])
                .unwrap();
        } else {
            ignore
                .add_with(&mut compiler, [pattern.as_str()])
                .unwrap();
        }
        let expected: Vec<Rule> = expected
            .into_iter()
            .map(|(source, negative)| Rule { source, negative })
            .collect();
        assert_eq!(ignore.rules(), expected, "pattern {pattern:?}");
    }
}

#[test]
fn negation_after_positive_reuses_the_positive_source() {
    let mut compiler = Compiler::new();
    let mut ignore = Ignore::new();
    ignore
        .add_with(&mut compiler, ["node_modules", "!node_modules"])
        .unwrap();
    let [positive, negative] = ignore.rules() else { panic!("two rules") };
    assert_eq!(positive.source, negative.source);
    assert!(negative.negative);
}

#[test]
fn add_ignore_appends_rules_in_order() {
    let mut compiler = Compiler::new();
    let mut first = Ignore::new();
    first
        .add_with(&mut compiler, ["a"])
        .unwrap();
    let mut second = Ignore::new();
    second
        .add_with(&mut compiler, ["b"])
        .unwrap();
    first.add_ignore(&second);
    let sources: Vec<_> = first
        .rules()
        .iter()
        .map(|rule| rule.source.as_str())
        .collect();
    assert_eq!(sources, [r"(?:^|\/)a(?=$|\/)", r"(?:^|\/)b(?=$|\/)"]);
}

#[test]
fn object_prototype_names_are_unsupported() {
    let mut compiler = Compiler::new();
    let error = Ignore::new()
        .add_with(&mut compiler, ["constructor"])
        .unwrap_err();
    assert_eq!(error, UnsupportedPattern("constructor".to_string()));
    let negated = Ignore::new()
        .add_with(&mut compiler, ["!__proto__"])
        .map(|_| ());
    assert_eq!(negated, Err(UnsupportedPattern("__proto__".to_string())));
}
