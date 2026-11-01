//! Version helpers shared by the manifest calculation stages.
//!
//! Converts snap hashes to `0.0.0-<hash>` semver strings and classifies range vs. exact specifiers.

use super::semver::valid_range;
use crate::model::{Lifecycle, PolicyEntry};
use regress::Regex;
use std::{io, sync::OnceLock};

/// `isHash` of `@teambit/component-version`: 3 to 40 lowercase hex characters.
#[inline]
pub(super) fn is_hash(version: &str) -> bool {
    let trimmed = version.trim();
    (3..=40).contains(&trimmed.len())
        && trimmed
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

/// `snapToSemver`: a snap hash becomes `0.0.0-<hash>`.
#[inline]
pub(super) fn snap_to_semver(version: &str) -> String {
    let trimmed = version.trim();
    if is_hash(trimmed) { format!("0.0.0-{trimmed}") } else { trimmed.to_string() }
}

#[inline]
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
    let trimmed = version.trim();
    if trimmed.starts_with("workspace:")
        || trimmed.starts_with("npm:")
        || bit_object_import::plus_version::is_plus(trimmed)
    {
        return Ok(false);
    }
    let Some(valid) = valid_range(trimmed) else {
        if is_hash(trimmed) {
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
#[inline]
pub(super) fn policy_version<'a>(
    entries: &'a [PolicyEntry],
    name: &str,
    lifecycle: Lifecycle,
) -> Option<&'a str> {
    let name = name.trim();
    entries
        .iter()
        .find(|entry| entry.name.trim() == name && entry.lifecycle == lifecycle)
        .map(|entry| entry.version.trim())
}

/// `id@version` → `id`.
#[inline]
pub(super) fn without_version(id: &str) -> &str {
    let trimmed = id.trim();
    match trimmed.rfind('@') {
        Some(index) if index > 0 && !trimmed[index + 1..].contains('/') => {
            trimmed[..index].trim_end()
        }
        _ => trimmed,
    }
}

/// `id@version` → `version`.
#[inline]
pub(super) fn version_of(id: &str) -> Option<&str> {
    let trimmed = id.trim();
    trimmed
        .rfind('@')
        .filter(|&index| index > 0 && !trimmed[index + 1..].contains('/'))
        .map(|index| trimmed[index + 1..].trim())
        .filter(|version| !version.is_empty())
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
