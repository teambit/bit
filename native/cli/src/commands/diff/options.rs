//! The workspace diff arguments whose selection and output are owned here.

#[derive(Default)]
pub(super) struct Options {
    pub pattern: Option<String>,
    pub versions: Range,
    pub json: bool,
    pub files_only: bool,
    pub configs_only: bool,
    pub name_only: bool,
    pub stat: bool,
    pub files: Vec<String>,
}

#[derive(Default)]
pub(super) struct Range {
    pub from: Option<String>,
    pub to: Option<String>,
}

pub(super) fn parse(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut index = 0;
    while let Some(arg) = args.get(index) {
        index += 1;
        parse_arg(&mut options, arg, args, &mut index)?;
    }
    if options.configs_only && (options.files_only || !options.files.is_empty())
        || options.name_only && options.stat
    {
        return None;
    }
    Some(options)
}

fn parse_arg(options: &mut Options, arg: &str, args: &[&str], index: &mut usize) -> Option<()> {
    if arg == "--file" && options.files.is_empty() {
        options.files = file_list(args.get(*index)?)?;
        *index += 1;
    } else if arg.starts_with('-') {
        set_boolean(options, arg).then_some(())?;
    } else if options.pattern.is_none() {
        options.pattern = Some(arg.to_string());
    } else if options.versions.from.is_none() {
        options.versions.from = Some(arg.to_string());
    } else if options.versions.to.is_none() {
        options.versions.to = Some(arg.to_string());
    } else {
        return None;
    }
    Some(())
}

fn file_list(value: &str) -> Option<Vec<String>> {
    let files: Vec<String> = value
        .split(',')
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(str::to_string)
        .collect();
    (!files.is_empty() && !value.starts_with('-')).then_some(files)
}

fn set_boolean(options: &mut Options, flag: &str) -> bool {
    let field = match flag {
        "-j" | "--json" => &mut options.json,
        "--files-only" => &mut options.files_only,
        "--configs-only" => &mut options.configs_only,
        "--name-only" => &mut options.name_only,
        "--stat" => &mut options.stat,
        _ => return false,
    };
    if *field {
        return false;
    }
    *field = true;
    true
}

#[cfg(test)]
mod tests;
