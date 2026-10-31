//! Version helpers shared by the manifest stages.

use super::semver::valid_range;
use crate::model::{Lifecycle, PolicyEntry};
use regress::Regex;
use std::{io, sync::OnceLock};

/// `isHash` of `@teambit/component-version`: 3 to 40 hex characters.
pub(super) fn is_hash(version: &str) -> bool {
    let trimmed = version.trim();
    (3..=40).contains(&trimmed.len()) && trimmed.bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// `snapToSemver`: a snap hash becomes `0.0.0-<hash>`.
pub(super) fn snap_to_semver(version: &str) -> String {
    let trimmed = version.trim();
    if is_hash(trimmed) { format!("0.0.0-{trimmed}") } else { trimmed.to_string() }
}

fn trailing_version() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"([\d]+\.[\d]+\.[\d]+(?:-[\w.]+)?)$").expect("trailing version expression")
    })
}

/// `isRange` of the dedupe: whether `version` is a range rather than an exact
/// version. Throws (`Err`) on a spec that is neither a range nor a hash,
/// `workspace:`, `npm:` or `+`.
pub(super) fn is_range(version: &str, origin: &str) -> io::Result<bool> {
    let Some(valid) = valid_range(version) else {
        let allowed = is_hash(version)
            || version.starts_with("workspace:")
            || version.starts_with("npm:")
            || bit_object_import::plus_version::is_plus(version);
        if allowed {
            return Ok(false);
        }
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!(
                r#"fatal: the version "{version}" originated from a dependent "{origin}" is invalid semver range and not a hash"#,
            ),
        ));
    };
    if valid == "*" {
        return Ok(true);
    }
    // `semver-intersect`'s `parseRange` reads the trailing version, throwing without one.
    if trailing_version().find(&valid).is_none() {
        return Err(io::Error::other(format!(r#"cannot read the version of the range "{valid}""#)));
    }
    let condition_len = valid
        .bytes()
        .take_while(|byte| b"<=>".contains(byte))
        .count();
    Ok(condition_len > 0 && &valid[..condition_len] != "=")
}

/// `policy.getDepVersion(name, lifecycle)`: the first entry for the name and lifecycle.
pub(super) fn policy_version<'a>(
    entries: &'a [PolicyEntry],
    name: &str,
    lifecycle: Lifecycle,
) -> Option<&'a str> {
    entries
        .iter()
        .find(|entry| entry.name == name && entry.lifecycle == lifecycle)
        .map(|entry| entry.version.as_str())
}

/// `id@version` → `id`.
pub(super) fn without_version(id: &str) -> &str {
    let trimmed = id.trim();
    match trimmed.rfind('@') {
        Some(index) if index > 0 && !trimmed[index + 1..].contains('/') => &trimmed[..index],
        _ => trimmed,
    }
}

/// `id@version` → `version`.
pub(super) fn version_of(id: &str) -> Option<&str> {
    let trimmed = id.trim();
    match trimmed.rfind('@') {
        Some(index) if index > 0 && !trimmed[index + 1..].contains('/') => {
            let version = trimmed[index + 1..].trim();
            (!version.is_empty()).then_some(version)
        }
        _ => None,
    }
}

/// Bit's core envs (`EnvsMain.getCoreEnvsIds`).
pub(super) const CORE_ENVS: [&str; 10] = [
    "teambit.harmony/aspect",
    "teambit.react/react",
    "teambit.harmony/node",
    "teambit.react/react-native",
    "teambit.html/html",
    "teambit.mdx/mdx",
    "teambit.envs/env",
    "teambit.mdx/readme",
    "teambit.harmony/bit-custom-aspect",
    "teambit.harmony/empty-env",
];
