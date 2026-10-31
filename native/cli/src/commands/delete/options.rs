//! `DeleteCmd`'s local soft-deletion selection grammar.
use bit_object_import::component_delete::Scope;
pub(super) struct Options<'a> {
    pub pattern: &'a str,
    pub silent: bool,
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
            "--" => {
                consume_trailing_delete_pattern(iter, &mut pattern)?;
                break;
            }
            "--no-color" | "--no-color=true" | "--no-color=false" | "--hard=false"
            | "--force=false" | "-f" | "--force" | "--force=true" => {}
            "-s" | "--silent" | "--silent=true" | "-sf" | "-fs" => silent = true,
            "--silent=false" => silent = false,
            "--lane" | "--lane=true" => lane = true,
            "--lane=false" => lane = false,
            "--update-main" | "--update-main=true" => update_main = true,
            "--update-main=false" => update_main = false,
            "--range" | "--snaps" if modifier.is_none_or(|(flag, _)| flag == arg) => {
                let val = iter.next()?.trim();
                (!val.is_empty() && !val.starts_with('-')).then_some(())?;
                modifier = Some((arg, val));
            }
            _ => apply_inline_or_pattern(arg, &mut modifier, &mut pattern)?,
        }
    }
    Some(Options {
        pattern: pattern
            .map(str::trim)
            .filter(|pat| !pat.is_empty())?,
        silent,
        lane,
        update_main,
        scope: scope(modifier),
    })
}
pub(in crate::commands) fn consume_trailing_delete_pattern<'a>(
    iter: impl Iterator<Item = &'a str>,
    pattern: &mut Option<&'a str>,
) -> Option<()> {
    for val in iter {
        let val = val.trim();
        (!val.is_empty() && !val.starts_with('-') && pattern.replace(val).is_none()).then_some(())?;
    }
    Some(())
}
fn apply_inline_or_pattern<'a>(
    arg: &'a str,
    modifier: &mut Option<(&'a str, &'a str)>,
    pattern: &mut Option<&'a str>,
) -> Option<()> {
    if let Some(val) = arg.strip_prefix("--range=").map(str::trim) {
        (!val.is_empty()
            && !val.starts_with('-')
            && modifier.is_none_or(|(flag, _)| flag == "--range"))
        .then_some(())?;
        *modifier = Some(("--range", val));
    } else if let Some(val) = arg.strip_prefix("--snaps=").map(str::trim) {
        (!val.is_empty()
            && !val.starts_with('-')
            && modifier.is_none_or(|(flag, _)| flag == "--snaps"))
        .then_some(())?;
        *modifier = Some(("--snaps", val));
    } else if !arg.starts_with('-') && !arg.trim().is_empty() && pattern.is_none() {
        *pattern = Some(arg.trim());
    } else {
        return None;
    }
    Some(())
}
fn scope(modifier: Option<(&str, &str)>) -> Scope {
    match modifier {
        Some(("--range", value)) if !value.trim().is_empty() => Scope::Range(value.trim().into()),
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
