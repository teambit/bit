//! `RemoveCmd`'s local, noninteractive flag grammar.
pub(super) struct Options<'a> {
    pub pattern: &'a str,
    pub keep: bool,
    pub force: bool,
    pub track: bool,
}
pub(super) fn parse<'a>(args: &[&'a str]) -> Option<Options<'a>> {
    let mut pattern = None;
    let mut silent = false;
    let mut options = Options { pattern: "", keep: false, force: false, track: false };
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg.trim() {
            "--" => {
                crate::commands::delete::options::consume_trailing_delete_pattern(
                    iter,
                    &mut pattern,
                )?;
                break;
            }
            "--no-color" | "--no-color=true" | "--no-color=false" | "--color" | "--color=true"
            | "--color=false" | "--color=always" | "--color=never" => {}
            "-s" | "--silent" | "--silent=true" => silent = true,
            "--silent=false" => silent = false,
            "--keep-files" | "--keep-files=true" => options.keep = true,
            "--keep-files=false" => options.keep = false,
            "-f" | "--force" | "--force=true" => options.force = true,
            "--force=false" => options.force = false,
            "-t" | "--track" | "--track=true" => options.track = true,
            "--track=false" => options.track = false,
            value if !value.starts_with('-') && !value.is_empty() && pattern.is_none() => {
                pattern = Some(value);
            }
            value => apply_short_bundle(value, &mut silent, &mut options)?,
        }
    }
    options.pattern = pattern?;
    silent.then_some(options)
}

fn apply_short_bundle(arg: &str, silent: &mut bool, options: &mut Options<'_>) -> Option<()> {
    let flags = arg
        .strip_prefix('-')
        .filter(|flags| !flags.is_empty() && !flags.starts_with('-'))?;
    for ch in flags.chars() {
        match ch {
            's' => *silent = true,
            'f' => options.force = true,
            't' => options.track = true,
            _ => return None,
        }
    }
    Some(())
}
