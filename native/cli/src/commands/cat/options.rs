//! Option parsing for `bit cat`.

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
        Some((flag, val)) if val.trim() == "true" => (flag.trim(), true),
        Some((flag, val)) if val.trim() == "false" => (flag.trim(), false),
        None => (arg.trim(), true),
        _ => return false,
    };
    match flag {
        "--config" | "-c" if val || arg.starts_with("--") => options.config = val,
        "--all" | "-a" if val || arg.starts_with("--") => options.all = val,
        "--json" | "-j" if val || arg.starts_with("--") => options.json = val,
        _ => return false,
    }
    true
}

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

fn set_cat_file<'a>(options: &mut Options<'a>, val: &'a str, consumed: usize) -> Option<usize> {
    let trimmed = val.trim();
    if options.file.is_some() || trimmed.is_empty() || trimmed.starts_with('-') {
        return None;
    }
    options.file = Some(trimmed);
    Some(consumed)
}
