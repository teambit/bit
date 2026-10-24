//! `RecoverCmd`'s two installation controls apply only to grouped imports.
pub(super) struct Options<'a> {
    pub pattern: &'a str,
    pub skip_installation: bool,
    pub skip_config: bool,
}
pub(super) fn parse<'a>(args: &[&'a str]) -> Option<Options<'a>> {
    let mut options = Options { pattern: "", skip_installation: false, skip_config: false };
    for arg in args {
        match *arg {
            "-x" | "--skip-dependency-installation" if !options.skip_installation => {
                options.skip_installation = true;
            }
            "--skip-write-config-files" if !options.skip_config => options.skip_config = true,
            value if !value.starts_with('-') && options.pattern.is_empty() => {
                options.pattern = value;
            }
            _ => return None,
        }
    }
    (!options.pattern.is_empty()).then_some(options)
}
