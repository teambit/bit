//! Published dependency-resolver plus-version placeholders.

#[cfg(test)]
mod tests;

/// `isPlusVersion`: exact, caret and tilde placeholders follow the resolved dependency.
#[must_use]
pub fn is_plus(version: &str) -> bool {
    matches!(version.trim(), "+" | "+^" | "+~")
}

/// `resolvePlusVersion`: prefix only release tags, retaining snaps and existing ranges.
#[must_use]
pub fn resolve(version: &str, resolved: Option<&str>, fallback: &str) -> String {
    let Some(prefix) = version
        .trim()
        .strip_prefix('+')
        .filter(|prefix| matches!(*prefix, "" | "^" | "~"))
    else {
        return version.to_owned();
    };
    let Some(resolved) = resolved
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return fallback.to_owned();
    };
    if !prefix.is_empty()
        && !resolved
            .trim_start_matches(['v', 'V'])
            .starts_with("0.0.0-")
        && node_semver::npm::valid(resolved).is_some()
    {
        format!("{prefix}{resolved}")
    } else {
        resolved.to_owned()
    }
}
