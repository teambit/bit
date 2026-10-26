//! Published dependency-resolver plus-version placeholders.

/// `isPlusVersion`: exact, caret and tilde placeholders follow the resolved dependency.
#[must_use]
pub fn is_plus(version: &str) -> bool {
    matches!(version, "+" | "+^" | "+~")
}

/// `resolvePlusVersion`: prefix only release tags, retaining snaps and existing ranges.
#[must_use]
pub fn resolve(version: &str, resolved: Option<&str>, fallback: &str) -> String {
    if !is_plus(version) {
        return version.to_owned();
    }
    let Some(resolved) = resolved.filter(|value| !value.is_empty()) else {
        return fallback.to_owned();
    };
    if !resolved.starts_with("0.0.0-") && node_semver::npm::valid(resolved).is_some() {
        format!("{}{resolved}", &version[1..])
    } else {
        resolved.to_owned()
    }
}

#[cfg(test)]
mod tests;
