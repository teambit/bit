//! `RecoverCmd`'s two installation controls apply only to grouped imports.
//!
//! Defines [`Options`], [`parse`], [`consume_trailing_pattern`], and [`is_valid_pattern_token`] for `bit recover <pattern>` CLI flags.
/// Parsed CLI options for `bit recover <pattern>`.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub(super) struct Options<'a> {
    pub pattern: &'a str,
    pub skip_installation: bool,
    pub skip_config: bool,
}
/// Parses CLI arguments after `bit recover` into [`Options`] via [`consume_trailing_pattern`] and [`is_valid_pattern_token`], returning `None` for unsupported flags.
pub(super) fn parse<'a>(args: &[&'a str]) -> Option<Options<'a>> {
    let mut options = Options { pattern: "", skip_installation: false, skip_config: false };
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg.trim() {
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
            value if is_valid_pattern_token(value) && options.pattern.is_empty() => {
                options.pattern = value;
            }
            _ => return None,
        }
    }
    (!options.pattern.is_empty()).then_some(options)
}

/// Consumes the single trailing positional pattern argument after `--` into `pattern`.
#[inline]
fn consume_trailing_pattern<'a>(
    iter: impl Iterator<Item = &'a str>,
    pattern: &mut &'a str,
) -> Option<()> {
    for rest in iter {
        let trimmed = rest.trim();
        if !is_valid_pattern_token(trimmed) || !pattern.is_empty() {
            return None;
        }
        *pattern = trimmed;
    }
    Some(())
}

/// Returns `true` when `token` is a non-empty, bounded positional component pattern without whitespace or leading `-`.
#[inline]
fn is_valid_pattern_token(token: &str) -> bool {
    !token.is_empty()
        && token.len() <= 1024
        && !token.starts_with('-')
        && !token.contains(char::is_whitespace)
}
