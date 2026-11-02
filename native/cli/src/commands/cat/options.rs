//! [`Options`] and [`parse`] option parsing for `bit cat`.
//!
//! Validates component ID positionals and `--file`, `--config`, `--all`, and `--json` flags.

/// Parsed CLI flags and positional component ID for `bit cat`.
#[derive(Default)]
pub(super) struct Options<'a> {
    pub(super) id: Option<&'a str>,
    pub(super) file: Option<&'a str>,
    pub(super) config: bool,
    pub(super) all: bool,
    pub(super) json: bool,
}

pub(super) fn parse<'a>(args: &[&'a str]) -> Option<Options<'a>> {
    let mut options = Options::default();
    let mut index = 0;
    while let Some(&arg) = args.get(index) {
        if arg == "--" {
            for &rest in &args[index + 1..] {
                let trimmed = rest.trim();
                (!trimmed.is_empty()
                    && !trimmed.starts_with('-')
                    && options.id.replace(trimmed).is_none())
                .then_some(())?;
            }
            break;
        }
        index += apply_cat_arg(&mut options, arg, args.get(index + 1).copied())?;
    }
    options.id.map(|_| options)
}

fn apply_cat_arg<'a>(
    options: &mut Options<'a>,
    arg: &'a str,
    next: Option<&'a str>,
) -> Option<usize> {
    if let Some(val) = arg
        .strip_prefix("--file=")
        .or_else(|| arg.strip_prefix("-f="))
    {
        return set_cat_file(options, val, 1);
    }
    if apply_cat_combined_short(options, arg)
        || apply_cat_bool(options, arg)
        || matches!(arg, "--no-color" | "--no-color=true" | "--no-color=false")
    {
        return Some(1);
    }
    match arg {
        "--file" | "-f" => set_cat_file(options, next?, 2),
        id if !id.starts_with('-') && !id.trim().is_empty() && options.id.is_none() => {
            options.id = Some(id.trim());
            Some(1)
        }
        _ => None,
    }
}

fn apply_cat_bool(options: &mut Options<'_>, arg: &str) -> bool {
    let (flag, val) = match arg.split_once('=') {
        Some((flag, raw)) => {
            let Some(val) = parse_bool_val(raw) else { return false };
            (flag.trim(), val)
        }
        None => (arg.trim(), true),
    };
    if !val && !arg.starts_with("--") {
        return false;
    }
    match flag {
        "--config" | "-c" => options.config = val,
        "--all" | "-a" => options.all = val,
        "--json" | "-j" => options.json = val,
        _ => return false,
    }
    true
}

#[inline]
fn parse_bool_val(raw: &str) -> Option<bool> {
    let trimmed = raw.trim();
    if trimmed.eq_ignore_ascii_case("true") || trimmed == "1" {
        Some(true)
    } else if trimmed.eq_ignore_ascii_case("false") || trimmed == "0" {
        Some(false)
    } else {
        None
    }
}

#[inline]
fn apply_cat_combined_short(options: &mut Options<'_>, arg: &str) -> bool {
    if !arg.starts_with('-')
        || arg.starts_with("--")
        || arg.len() <= 2
        || !arg[1..]
            .bytes()
            .all(|byte| matches!(byte, b'c' | b'a' | b'j'))
    {
        return false;
    }
    for byte in arg[1..].bytes() {
        match byte {
            b'c' => options.config = true,
            b'a' => options.all = true,
            _ => options.json = true,
        }
    }
    true
}

#[inline]
fn set_cat_file<'a>(options: &mut Options<'a>, val: &'a str, consumed: usize) -> Option<usize> {
    let trimmed = val.trim();
    if options.file.is_some()
        || trimmed.is_empty()
        || trimmed.starts_with('-')
        || trimmed.chars().any(char::is_control)
    {
        return None;
    }
    options.file = Some(trimmed);
    Some(consumed)
}
