//! Default dependency binding prefixes and package names.

/// `@<owner>` of `owner.scope/name`.
pub(super) fn default_prefix(identity: &str) -> String {
    let owner = identity
        .split('.')
        .next()
        .unwrap_or_default();
    format!(
        "@{}",
        owner
            .split('/')
            .next()
            .unwrap_or_default(),
    )
}

/// `packageName(id, storedPrefix)`.
pub(super) fn package_name(identity: &str, stored_prefix: Option<&str>) -> String {
    let scope = identity
        .split('/')
        .next()
        .unwrap_or_default();
    let prefix = stored_prefix.map_or_else(
        || {
            format!(
                "@{}",
                scope
                    .split('.')
                    .next()
                    .unwrap_or_default(),
            )
        },
        str::to_string,
    );
    let name = identity.replace('/', ".");
    let owner = format!("{}.", prefix.replacen('@', "", 1));
    let name = match name.strip_prefix(&owner) {
        Some(rest) if prefix != "@bit" => rest.to_string(),
        _ => name,
    };
    format!("{prefix}/{name}")
}
