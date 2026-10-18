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
    for arg in args {
        match *arg {
            "-s" | "--silent" if !silent => silent = true,
            "--keep-files" if !options.keep => options.keep = true,
            "-f" | "--force" if !options.force => options.force = true,
            "-t" | "--track" if !options.track => options.track = true,
            value if !value.starts_with('-') && pattern.is_none() => pattern = Some(value),
            _ => return None,
        }
    }
    options.pattern = pattern?;
    silent.then_some(options)
}
