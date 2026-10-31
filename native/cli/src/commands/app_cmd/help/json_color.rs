//! Released yargs unknown-option ordering and deduplication for app JSON/color flags.

use super::is_json_flag;

pub(super) fn error(args: &[&str], list: bool) -> Option<String> {
    let mut unknown = Vec::new();
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

fn unknown_names(flag: &str, list: bool) -> Option<&'static [&'static str]> {
    let trimmed = flag.trim();
    let name = trimmed.split_once('=').map_or(trimmed, |(prefix, _)| prefix.trim());
    match name {
        "--no-color" => Some(&["no-color", "noColor"]),
        "--json" if !list => Some(&["json"]),
        "-j" if !list => Some(&["j"]),
        _ if list && is_json_flag(trimmed) => Some(&[]),
        _ => None,
    }
}
