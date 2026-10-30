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
            "--no-color"
            | "--hard=false"
            | "--silent=false"
            | "--lane=false"
            | "--update-main=false" => {}
            "-s" | "--silent" | "--silent=true" if !silent => silent = true,
            "--lane" | "--lane=true" if !lane => lane = true,
            "--update-main" | "--update-main=true" if !update_main => update_main = true,
            "--range" | "--snaps" if modifier.is_none() => {
                let val = iter.next()?;
                (!val.is_empty() && !val.starts_with('-')).then_some(())?;
                modifier = Some((arg, val));
            }
            _ => apply_inline_or_pattern(arg, &mut modifier, &mut pattern)?,
        }
    }
    silent.then_some(Options { pattern: pattern?, lane, update_main, scope: scope(modifier) })
}
fn apply_inline_or_pattern<'a>(
    arg: &'a str,
    modifier: &mut Option<(&'a str, &'a str)>,
    pattern: &mut Option<&'a str>,
) -> Option<()> {
    if let Some(val) = arg.strip_prefix("--range=") {
        (!val.is_empty() && modifier.is_none()).then_some(())?;
        *modifier = Some(("--range", val));
    } else if let Some(val) = arg.strip_prefix("--snaps=") {
        (!val.is_empty() && modifier.is_none()).then_some(())?;
        *modifier = Some(("--snaps", val));
    } else if !arg.starts_with('-') && pattern.is_none() {
        *pattern = Some(arg);
    } else {
        return None;
    }
    Some(())
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
