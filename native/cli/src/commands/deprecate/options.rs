pub(super) struct Options<'a> {
    pub pattern: &'a str,
    pub replacement: Option<&'a str>,
    pub range: Option<&'a str>,
}
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

fn consume_trailing_pattern<'a>(rest: &[&'a str], pattern: &mut Option<&'a str>) -> Option<()> {
    for &arg in rest {
        if pattern.is_some() {
            return None;
        }
        *pattern = Some(valid_val(arg)?);
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
        "--no-color" => Some(index + 1),
        "--new-id" if !undo => {
            *replacement = Some(valid_val(args.get(index + 1)?)?);
            Some(index + 2)
        }
        "--range" if !undo => {
            *range = Some(valid_val(args.get(index + 1)?)?);
            Some(index + 2)
        }
        arg if !undo && apply_inline_flag(arg, replacement, range) => Some(index + 1),
        arg if !arg.starts_with('-') && !arg.is_empty() && pattern.is_none() => {
            *pattern = Some(arg);
            Some(index + 1)
        }
        _ => None,
    }
}

fn apply_inline_flag<'a>(
    arg: &'a str,
    replacement: &mut Option<&'a str>,
    range: &mut Option<&'a str>,
) -> bool {
    if let Some(val) = arg.strip_prefix("--new-id=").and_then(valid_val) {
        *replacement = Some(val);
        return true;
    }
    if let Some(val) = arg.strip_prefix("--range=").and_then(valid_val) {
        *range = Some(val);
        return true;
    }
    false
}

fn valid_val(val: &str) -> Option<&str> {
    (!val.is_empty() && !val.starts_with('-')).then_some(val)
}
