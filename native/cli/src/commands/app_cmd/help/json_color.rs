//! Released yargs unknown-option [`error`] ordering and deduplication for [`is_json_flag`] and color flags.
//!
//! Formats `Unknown argument` and `Unknown arguments` messages for invalid `--json`/`--no-color` flags.

use super::is_json_flag;

/// Formats yargs `Unknown argument` / `Unknown arguments` diagnostics for unsupported flags in `args`.
#[inline]
pub(super) fn error(args: &[&str], list: bool) -> Option<String> {
    let mut unknown = Vec::with_capacity(3);
    for flag in args {
        for name in unknown_names(flag, list)? {
            if !unknown.contains(name) {
                unknown.push(*name);
            }
        }
    }
    match unknown.as_slice() {
        [] => None,
        [name] => Some(format!("Unknown argument: {name}")),
        _ => Some(format!("Unknown arguments: {}", unknown.join(", "))),
    }
}

/// Maps an unsupported `--no-color` or `--json`/`-j` flag via [`is_json_flag`] to its yargs unknown-argument names for [`error`].
#[inline]
fn unknown_names(flag: &str, list: bool) -> Option<&'static [&'static str]> {
    let trimmed = flag.trim();
    if trimmed.is_empty() {
        return None;
    }
    let (name, inline) = trimmed
        .split_once('=')
        .map_or((trimmed, None), |(prefix, val)| (prefix.trim(), Some(val.trim())));
    if name.is_empty() || inline.is_some_and(|val| val.is_empty() || val.starts_with('-')) {
        return None;
    }
    match name {
        "--no-color" => Some(&["no-color", "noColor"]),
        "--json" if !list => Some(&["json"]),
        "-j" if !list => Some(&["j"]),
        _ if list && is_json_flag(trimmed) => Some(&[]),
        _ => None,
    }
}
