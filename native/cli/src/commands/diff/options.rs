//! The workspace diff arguments whose selection and output are owned here.

#[derive(Default)]
pub(super) struct Options {
    pub pattern: Option<String>,
    pub versions: Range,
    pub output: Output,
}

#[derive(Default)]
pub(super) struct Output {
    pub json: bool,
    pub table: bool,
    pub verbose: bool,
    pub files_only: bool,
    pub configs_only: bool,
    pub name_only: bool,
    pub stat: bool,
    pub files: Vec<String>,
}

#[derive(Default)]
pub(super) struct Range {
    pub parent: bool,
    pub from: Option<String>,
    pub to: Option<String>,
}

pub(super) fn parse(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut index = 0;
    while let Some(&arg) = args.get(index) {
        index += 1;
        if arg == "--" {
            for &rest in &args[index..] {
                push_positional(&mut options, rest)?;
            }
            break;
        }
        parse_arg(&mut options, arg, args, &mut index)?;
    }
    Some(options)
}

/// Mutually exclusive output flag error reported by `DiffCmd.parseOutputOpts`.
pub(super) fn output_error(options: &Options) -> Option<&'static str> {
    if options.output.files_only && options.output.configs_only {
        return Some("--files-only and --configs-only are mutually exclusive");
    }
    if options.output.configs_only && !options.output.files.is_empty() {
        return Some("--file and --configs-only are mutually exclusive");
    }
    if options.output.name_only && options.output.stat {
        return Some("--name-only and --stat are mutually exclusive");
    }
    None
}

fn parse_arg(options: &mut Options, arg: &str, args: &[&str], index: &mut usize) -> Option<()> {
    if matches!(arg, "--no-color" | "--no-color=true" | "--no-color=false") {
        return Some(());
    }
    if arg == "--file" && options.output.files.is_empty() {
        options.output.files = file_list(args.get(*index)?)?;
        *index += 1;
        return Some(());
    }
    if let Some(inline) = arg.strip_prefix("--file=") {
        options.output.files
            .is_empty()
            .then_some(())?;
        options.output.files = file_list(inline)?;
        return Some(());
    }
    if arg.starts_with('-') {
        return set_boolean(options, arg).then_some(());
    }
    push_positional(options, arg)
}

fn push_positional(options: &mut Options, arg: &str) -> Option<()> {
    let trimmed = arg.trim();
    if trimmed.is_empty() || trimmed.starts_with('-') {
        return None;
    }
    if options.pattern.is_none() {
        options.pattern = Some(trimmed.to_string());
    } else if options.versions.from.is_none() {
        options.versions.from = Some(trimmed.to_string());
    } else if options.versions.to.is_none() {
        options.versions.to = Some(trimmed.to_string());
    } else {
        return None;
    }
    Some(())
}

fn file_list(value: &str) -> Option<Vec<String>> {
    let trimmed = value.trim();
    let files: Vec<String> = trimmed
        .split(',')
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(str::to_string)
        .collect();
    (!files.is_empty() && !trimmed.starts_with('-')).then_some(files)
}

fn set_boolean(options: &mut Options, flag: &str) -> bool {
    if set_combined_short(options, flag) {
        return true;
    }
    let (key, val) = match flag.split_once('=') {
        Some((key, "true")) if key.starts_with("--") => (key, true),
        Some((key, "false")) if key.starts_with("--") => (key, false),
        None => (flag, true),
        _ => return false,
    };
    let field = match key {
        "-j" | "--json" => &mut options.output.json,
        "--files-only" => &mut options.output.files_only,
        "--configs-only" => &mut options.output.configs_only,
        "--name-only" => &mut options.output.name_only,
        "-v" | "--verbose" => &mut options.output.verbose,
        "-t" | "--table" => &mut options.output.table,
        "--stat" => &mut options.output.stat,
        "-p" | "--parent" => &mut options.versions.parent,
        _ => return false,
    };
    *field = val;
    true
}

fn set_combined_short(options: &mut Options, flag: &str) -> bool {
    if !flag.starts_with('-')
        || flag.starts_with("--")
        || flag.len() <= 2
        || !flag[1..]
            .bytes()
            .all(|byte| matches!(byte, b'j' | b'v' | b't' | b'p'))
    {
        return false;
    }
    for byte in flag[1..].bytes() {
        match byte {
            b'j' => options.output.json = true,
            b'v' => options.output.verbose = true,
            b't' => options.output.table = true,
            _ => options.versions.parent = true,
        }
    }
    true
}

#[cfg(test)]
mod tests;
