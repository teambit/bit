//! `DeleteCmd`'s local soft-deletion selection grammar.
use bit_object_import::component_delete::Scope;
pub(super) struct Options<'a> {
    pub pattern: &'a str,
    pub lane: bool,
    pub update_main: bool,
    pub scope: Scope,
}
pub(super) fn parse<'a>(args: &[&'a str]) -> Option<Options<'a>> {
    let mut pattern = None;
    let mut silent = false;
    let mut lane = false;
    let mut update_main = false;
    let mut modifier = None;
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "-s" | "--silent" if !silent => silent = true,
            "--lane" if !lane => lane = true,
            "--update-main" if !update_main => update_main = true,
            "--range" | "--snaps" if modifier.is_none() => modifier = Some((arg, iter.next()?)),
            value if !value.starts_with('-') && pattern.is_none() => pattern = Some(value),
            _ => return None,
        }
    }
    silent.then_some(Options { pattern: pattern?, lane, update_main, scope: scope(modifier) })
}
fn scope(modifier: Option<(&str, &str)>) -> Scope {
    match modifier {
        Some(("--range", value)) if !value.is_empty() => Scope::Range(value.into()),
        Some(("--snaps", value)) => Scope::Snaps(
            value
                .split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
                .collect(),
        ),
        _ => Scope::Entire,
    }
}
