//! Published dependency-resolver plus-version placeholders.

/// `isPlusVersion`: exact, caret and tilde placeholders follow the resolved dependency.
#[must_use]
pub fn is_plus(version: &str) -> bool {
    matches!(version.trim(), "+" | "+^" | "+~")
}

/// `resolvePlusVersion`: prefix only release tags, retaining snaps and existing ranges.
#[must_use]
pub fn resolve(version: &str, resolved: Option<&str>, fallback: &str) -> String {
    let trimmed_version = version.trim();
    if !is_plus(trimmed_version) {
        return version.to_owned();
    }
    let Some(resolved) = resolved
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return fallback.to_owned();
    };
    if !resolved.starts_with("0.0.0-") && node_semver::npm::valid(resolved).is_some() {
        format!("{}{resolved}", trimmed_version.strip_prefix('+').unwrap_or_default())
    } else {
        resolved.to_owned()
    }
}

#[cfg(test)]
mod tests;
