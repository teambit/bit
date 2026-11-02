//! [`Options`] and [`parse`] CLI option parsing for `bit deprecate` and `bit undeprecate`.

/// Parsed target pattern, optional `--new-id` replacement, and optional `--range` for deprecation commands.
pub(super) struct Options<'a> {
    pub pattern: &'a str,
    pub replacement: Option<&'a str>,
    pub range: Option<&'a str>,
}
/// Parses `args` into deprecation [`Options`] when they fit the native `bit deprecate` or `bit undeprecate` grammar.
pub(super) fn parse<'a>(args: &[&'a str], undo: bool) -> Option<Options<'a>> {
    let mut pattern = None;
    let mut replacement = None;
    let mut range = None;
    let mut index = 0;
    while index < args.len() {
        if args[index] == "--" {
            consume_trailing_pattern(&args[index + 1..], &mut pattern)?;
            break;
        }
        index = apply_arg(args, index, undo, &mut pattern, &mut replacement, &mut range)?;
    }
    Some(Options { pattern: pattern?, replacement, range })
}

/// Consumes positional pattern tokens following `--`, rejecting multiple or invalid values.
#[inline]
fn consume_trailing_pattern<'a>(rest: &[&'a str], pattern: &mut Option<&'a str>) -> Option<()> {
    for &arg in rest {
        pattern
            .replace(valid_val(arg)?)
            .is_none()
            .then_some(())?;
    }
    Some(())
}

fn apply_arg<'a>(
    args: &[&'a str],
    index: usize,
    undo: bool,
    pattern: &mut Option<&'a str>,
    replacement: &mut Option<&'a str>,
    range: &mut Option<&'a str>,
) -> Option<usize> {
    match args[index] {
        "--no-color" | "--no-colors" | "--no-color=true" | "--no-color=false" | "--color"
        | "--colors" | "--color=true" | "--color=false" | "--color=always" | "--color=never" => {
            Some(index + 1)
        }
        "--new-id" if !undo => {
            set_non_conflicting(replacement, valid_val(args.get(index + 1)?)?)?;
            Some(index + 2)
        }
        "--range" if !undo => {
            set_non_conflicting(range, valid_val(args.get(index + 1)?)?)?;
            Some(index + 2)
        }
        arg if !undo && apply_inline_flag(arg, replacement, range) => Some(index + 1),
        arg if pattern.is_none()
            && let Some(val) = valid_val(arg) =>
        {
            *pattern = Some(val);
            Some(index + 1)
        }
        _ => None,
    }
}

#[inline]
fn set_non_conflicting<'a>(slot: &mut Option<&'a str>, val: &'a str) -> Option<()> {
    if slot.is_some_and(|prev| prev != val) {
        return None;
    }
    *slot = Some(val);
    Some(())
}

#[inline]
fn apply_inline_flag<'a>(
    arg: &'a str,
    replacement: &mut Option<&'a str>,
    range: &mut Option<&'a str>,
) -> bool {
    if let Some(val) = arg.strip_prefix("--new-id=").and_then(valid_val) {
        return set_non_conflicting(replacement, val).is_some();
    }
    if let Some(val) = arg.strip_prefix("--range=").and_then(valid_val) {
        return set_non_conflicting(range, val).is_some();
    }
    false
}

#[inline]
fn valid_val(val: &str) -> Option<&str> {
    let val = val.trim();
    (!val.is_empty() && !val.starts_with('-')).then_some(val)
}
