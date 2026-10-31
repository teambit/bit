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

pub(super) fn extension_identity(id: &serde_json::Value) -> String {
    if let Some(text) = id
        .as_str()
        .or_else(|| id["id"].as_str())
    {
        return text
            .strip_suffix("@latest")
            .unwrap_or(text)
            .to_string();
    }
    let id_obj = id
        .get("id")
        .filter(|sub| sub.is_object())
        .unwrap_or(id);
    let raw_name = id_obj["name"]
        .as_str()
        .or_else(|| id["name"].as_str())
        .unwrap_or_default();
    let (name, inline_ver) = raw_name
        .rsplit_once('@')
        .map_or((raw_name, None), |(base, ver)| (base, Some(ver)));
    let version = id_obj["version"]
        .as_str()
        .or_else(|| id["version"].as_str())
        .or_else(|| id_obj["head"].as_str())
        .or_else(|| id["head"].as_str())
        .filter(|version| !version.is_empty())
        .or(inline_ver)
        .filter(|version| !version.is_empty() && *version != "latest")
        .map_or_else(String::new, |version| format!("@{version}"));
    match id_obj["scope"]
        .as_str()
        .or_else(|| id["scope"].as_str())
        .filter(|scope| !scope.is_empty())
    {
        Some(scope) => format!("{scope}/{name}{version}"),
        None => format!("{name}{version}"),
    }
}
