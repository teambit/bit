//! Option parsing for `bit log`.
//!
//! Defines [`Options`] and [`parse`] to validate CLI flags before reading local or remote history.

/// Parsed CLI flags and target component identifier for `bit log`.
#[derive(Default)]
pub(super) struct Options<'a> {
    pub(super) id: Option<&'a str>,
    pub(super) json: bool,
    pub(super) parents: bool,
    pub(super) one_line: bool,
    pub(super) full_hash: bool,
    pub(super) full_message: bool,
    pub(super) show_hidden: bool,
    pub(super) remote: bool,
}

/// Parses CLI arguments after `bit log` into [`Options`] via [`apply_log_arg`] and [`consume_trailing_id`], returning `None` if no valid component ID is given.
#[inline]
pub(super) fn parse<'a>(args: &[&'a str]) -> Option<Options<'a>> {
    let mut options = Options::default();
    let mut iter = args.iter().copied();
    while let Some(raw_arg) = iter.next() {
        let arg = raw_arg.trim();
        if arg == "--" {
            consume_trailing_id(iter, &mut options.id)?;
            break;
        }
        apply_log_arg(&mut options, arg)?;
    }
    options.id.map(|_| options)
}

/// Consumes the single trailing component ID token after `--` into `id` for [`parse`].
#[inline]
fn consume_trailing_id<'a>(
    iter: impl Iterator<Item = &'a str>,
    id: &mut Option<&'a str>,
) -> Option<()> {
    for rest in iter {
        let trimmed = rest.trim();
        if trimmed.is_empty() || trimmed.len() > 1024 || trimmed.starts_with('-') || id.is_some() {
            return None;
        }
        *id = Some(trimmed);
    }
    Some(())
}

/// Applies a single `bit log` flag or positional component ID token `trimmed` onto `options` ([`Options`]) via [`parse_log_flag_value`].
fn apply_log_arg<'a>(options: &mut Options<'a>, trimmed: &'a str) -> Option<()> {
    if matches!(
        trimmed,
        "--no-color"
            | "--no-color=true"
            | "--no-color=false"
            | "--color"
            | "--color=true"
            | "--color=false"
            | "--color=always"
            | "--color=never",
    ) || apply_log_combined_short(options, trimmed)
    {
        return Some(());
    }
    if !trimmed.starts_with('-')
        && !trimmed.is_empty()
        && trimmed.len() <= 1024
        && options.id.is_none()
    {
        options.id = Some(trimmed);
        return Some(());
    }
    let (flag, val) = parse_log_flag_value(trimmed)?;
    let field = match flag {
        "-j" | "--json" => &mut options.json,
        "--parents" => &mut options.parents,
        "-o" | "--one-line" => &mut options.one_line,
        "-f" | "--full-hash" => &mut options.full_hash,
        "-m" | "--full-message" => &mut options.full_message,
        "--show-hidden" => &mut options.show_hidden,
        "-r" | "--remote" => &mut options.remote,
        _ => return None,
    };
    *field = val;
    Some(())
}

/// Splits a boolean `bit log` flag (or `--flag=true`/`--flag=false` assignment) into `(flag, value)`.
#[inline]
fn parse_log_flag_value(arg: &str) -> Option<(&str, bool)> {
    match arg.split_once('=') {
        Some((flag, raw)) if flag.starts_with("--") => {
            match raw
                .trim()
                .trim_matches(['"', '\''])
                .trim()
            {
                "true" => Some((flag, true)),
                "false" => Some((flag, false)),
                _ => None,
            }
        }
        None => Some((arg, true)),
        _ => None,
    }
}

#[inline]
fn apply_log_combined_short(options: &mut Options<'_>, arg: &str) -> bool {
    if !arg.starts_with('-')
        || arg.starts_with("--")
        || arg.len() <= 2
        || !arg[1..]
            .bytes()
            .all(|byte| matches!(byte, b'j' | b'o' | b'f' | b'm' | b'r'))
    {
        return false;
    }
    for byte in arg[1..].bytes() {
        *log_short_field(options, byte) = true;
    }
    true
}

#[inline]
fn log_short_field<'a>(options: &'a mut Options<'_>, byte: u8) -> &'a mut bool {
    match byte {
        b'j' => &mut options.json,
        b'o' => &mut options.one_line,
        b'f' => &mut options.full_hash,
        b'm' => &mut options.full_message,
        _ => &mut options.remote,
    }
}
