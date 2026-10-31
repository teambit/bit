//! `RecoverCmd`'s two installation controls apply only to grouped imports.
pub(super) struct Options<'a> {
    pub pattern: &'a str,
    pub skip_installation: bool,
    pub skip_config: bool,
}
pub(super) fn parse<'a>(args: &[&'a str]) -> Option<Options<'a>> {
    let mut options = Options { pattern: "", skip_installation: false, skip_config: false };
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                consume_trailing_pattern(iter, &mut options.pattern)?;
                break;
            }
            "--no-color" | "--no-color=true" | "--no-color=false" | "--color" | "--color=true"
            | "--color=false" | "--color=always" | "--color=never" => {}
            "-x" | "--skip-dependency-installation" | "--skip-dependency-installation=true" => {
                options.skip_installation = true;
            }
            "--skip-dependency-installation=false" => options.skip_installation = false,
            "--skip-write-config-files" | "--skip-write-config-files=true" => {
                options.skip_config = true;
            }
            "--skip-write-config-files=false" => options.skip_config = false,
            value if !value.trim().starts_with('-') && options.pattern.is_empty() => {
                options.pattern = value.trim();
            }
            _ => return None,
        }
    }
    (!options.pattern.is_empty()).then_some(options)
}

fn consume_trailing_pattern<'a>(
    iter: impl Iterator<Item = &'a str>,
    pattern: &mut &'a str,
) -> Option<()> {
    for rest in iter {
        let trimmed = rest.trim();
        if trimmed.is_empty() || trimmed.starts_with('-') || !pattern.is_empty() {
            return None;
        }
        *pattern = trimmed;
    }
    Some(())
}
