//! yargs-parser's positional number coercion ([`coerce`]) followed by `CheckoutCmd`'s `String(to)`.
//!
//! Exposes [`normalize`], [`valid_to`], and [`valid_revert_version`] to format numeric and hexadecimal positional arguments like `JavaScript`.
#[cfg(test)]
mod tests;

use std::sync::OnceLock;

/// Coerces numeric and hexadecimal checkout targets using yargs and `String(to)` rules via [`number`].
#[inline]
pub(super) fn normalize(raw: &str) -> String {
    let raw = raw.trim();
    number(raw)
        .and_then(|number| {
            serde_json::Number::from_f64(number)
                .and_then(|number| {
                    bit_object_import::stringify_json(&serde_json::Value::Number(number), false)
                        .ok()
                })
        })
        .unwrap_or_else(|| raw.into())
}
/// Parses a decimal or hexadecimal checkout target string as an `f64` when within safe integer bounds.
fn number(raw: &str) -> Option<f64> {
    let raw = raw.trim();
    if let Some(hex) = raw
        .strip_prefix("0x")
        .or_else(|| raw.strip_prefix("0X"))
    {
        // parseFloat("0x...") is zero, so yargs' safe-integer gate always accepts hex.
        if hex.is_empty() || !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return None;
        }
        return u128::from_str_radix(hex, 16)
            .ok()
            .map(|number| number as f64);
    }
    if raw.starts_with('0')
        && raw
            .as_bytes()
            .get(1)
            .is_some_and(|byte| *byte != b'.')
    {
        return None;
    }
    static DECIMAL: OnceLock<regress::Regex> = OnceLock::new();
    let grammar = DECIMAL.get_or_init(|| {
        regress::Regex::new(r"^[-]?(?:\d+(?:\.\d*)?|\.\d+)(e[-+]?\d+)?$")
            .expect("published yargs number grammar")
    });
    grammar.find(raw)?;
    let number = raw.parse::<f64>().ok()?;
    let integer = number.floor();
    (integer.is_finite() && integer.abs() <= 9_007_199_254_740_991.0).then_some(number)
}

/// Returns `true` when the suffix after `head~` parses as `NaN` in `JavaScript` `Number(...)`.
#[inline]
pub(super) fn head_tilde_is_nan(after: &str) -> bool {
    let trimmed = after.trim_start();
    let rest = trimmed
        .strip_prefix(['+', '-'])
        .unwrap_or(trimmed);
    if let Some(hex) = rest
        .strip_prefix("0x")
        .or_else(|| rest.strip_prefix("0X"))
    {
        return !hex
            .bytes()
            .next()
            .is_some_and(|byte| byte.is_ascii_hexdigit());
    }
    !rest
        .bytes()
        .next()
        .is_some_and(|byte| byte.is_ascii_digit())
}

/// Returns `true` when `to` is a valid concrete version or snap hash for `bit revert`.
#[inline]
pub(super) fn valid_revert_version(to: &str) -> bool {
    let to = to.trim();
    if matches!(to, "head" | "latest" | "reset") || to.starts_with("head~") {
        return false;
    }
    valid_to(to)
}

/// `head`, `latest`, `reset`, `main`, `head~N`, a snap hash or a semver tag.
#[inline]
pub(super) fn valid_to(to: &str) -> bool {
    let to = to.trim();
    if matches!(to, "head" | "latest" | "reset" | "main") {
        return true;
    }
    if let Some(steps) = to.strip_prefix("head~") {
        return !steps.is_empty() && steps.bytes().all(|byte| byte.is_ascii_digit());
    }
    if (3..=40).contains(&to.len()) && to.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return true;
    }
    valid_tag(to)
}

/// `[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?`.
fn valid_tag(to: &str) -> bool {
    let identifier = |text: &str| {
        !text.is_empty()
            && text
                .split('.')
                .all(|segment| {
                    !segment.is_empty()
                        && segment
                            .chars()
                            .all(|character| character.is_ascii_alphanumeric() || character == '-')
                })
    };
    let (main, build) = match to.split_once('+') {
        Some((main, build)) => (main, Some(build)),
        None => (to, None),
    };
    if build.is_some_and(|build| !identifier(build)) {
        return false;
    }
    let (core, prerelease) = match main.split_once('-') {
        Some((core, prerelease)) => (core, Some(prerelease)),
        None => (main, None),
    };
    if prerelease.is_some_and(|prerelease| !identifier(prerelease)) {
        return false;
    }
    let mut parts = core.split('.');
    parts.clone().count() == 3
        && parts.all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()))
}
