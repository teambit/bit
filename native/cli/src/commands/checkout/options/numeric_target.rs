//! yargs-parser's positional number coercion followed by `CheckoutCmd`'s `String(to)`.
#[cfg(test)]
mod tests;

use std::sync::OnceLock;

pub(super) fn normalize(raw: &str) -> String {
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

pub(super) fn valid_revert_version(to: &str) -> bool {
    let to = to.trim();
    if matches!(to, "head" | "latest" | "reset") || to.starts_with("head~") {
        return false;
    }
    valid_to(to)
}

/// `head`, `latest`, `reset`, `main`, `head~N`, a snap hash or a semver tag.
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
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || ".-".contains(character))
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
    let parts: Vec<&str> = core.split('.').collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()))
}
