//! Default dependency binding prefixes and package names.

use super::{Map, Value, component, decline, io, nullish, text};

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

pub(super) fn names(
    identity: &str,
    model: Option<&Value>,
    extensions: &[Value],
) -> (String, String) {
    let stored = model
        .and_then(|model| model.get("bindingPrefix"))
        .and_then(non_empty_str);
    let prefix = stored.map_or_else(|| default_prefix(identity), str::to_string);
    (prefix, configured_package_name(identity, stored, extensions))
}

fn configured_package_name(identity: &str, prefix: Option<&str>, extensions: &[Value]) -> String {
    let Some(pkg) =
        extensions.iter().find(|entry| component::matches_aspect(entry, "teambit.pkg/pkg"))
    else {
        return package_name(identity, prefix);
    };
    let (scope, name) = identity
        .split_once('/')
        .unwrap_or(("", identity));
    let id = bit_install::model::ComponentId {
        scope: Some(scope.to_string()),
        default_scope: None,
        name: name.to_string(),
        version: None,
    };
    let mut aspects = Map::new();
    aspects.insert("teambit.pkg/pkg".to_string(), pkg["config"].clone());
    bit_install::workspace::component_package_name(&id, prefix, &aspects)
}

pub(super) fn extension_identity(id: &Value) -> String {
    if let Some(text) = non_empty_str(id).or_else(|| non_empty_str(&id["id"])) {
        return strip_latest_or_head(text).to_string();
    }
    let id_obj = id
        .get("id")
        .filter(|sub| sub.is_object())
        .unwrap_or(id);
    let raw_name = non_empty_str(&id_obj["name"])
        .or_else(|| non_empty_str(&id["name"]))
        .unwrap_or_default();
    let (name, inline_ver) = raw_name
        .rsplit_once('@')
        .map_or((raw_name, None), |(base, ver)| (base.trim(), Some(ver.trim())));
    let version = non_empty_str(&id_obj["version"])
        .or_else(|| non_empty_str(&id["version"]))
        .or_else(|| non_empty_str(&id_obj["head"]))
        .or_else(|| non_empty_str(&id["head"]))
        .or(inline_ver)
        .filter(|version| !matches!(*version, "" | "latest" | "head"))
        .map_or_else(String::new, |version| format!("@{version}"));
    match non_empty_str(&id_obj["scope"]).or_else(|| non_empty_str(&id["scope"])) {
        Some(scope) => format!("{scope}/{name}{version}"),
        None => format!("{name}{version}"),
    }
}

fn non_empty_str(value: &Value) -> Option<&str> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

pub(super) fn identity(value: Option<&Value>) -> io::Result<String> {
    let outer = value.ok_or_else(|| decline("status dependency id"))?;
    let id = outer.get("id").unwrap_or(outer);
    if let Some(text) = id.as_str() {
        return Ok(strip_latest_or_head(text).to_string());
    }
    let part = |key| text(id.get(key).or_else(|| outer.get(key)));
    let raw_name = part("name")?;
    let (name, inline_ver) = raw_name
        .rsplit_once('@')
        .map_or((raw_name, None), |(base, ver)| (base, Some(ver)));
    let suffix = resolve_dep_version_suffix(outer, id, inline_ver)?;
    if let Some(scope) = part("scope")
        .ok()
        .filter(|scope| !scope.is_empty())
    {
        return Ok(format!("{scope}/{name}{suffix}"));
    }
    if name.contains('/') {
        return Ok(format!("{name}{suffix}"));
    }
    Err(decline("status dependency scope"))
}

fn resolve_dep_version_suffix(
    outer: &Value,
    id: &Value,
    inline_ver: Option<&str>,
) -> io::Result<String> {
    let raw_version = nullish(id.get("version"))
        .or_else(|| nullish(outer.get("version")))
        .or_else(|| nullish(id.get("head")))
        .or_else(|| nullish(outer.get("head")));
    let version = match raw_version {
        None => inline_ver
            .map(str::trim)
            .filter(|ver| !matches!(*ver, "" | "latest" | "head"))
            .unwrap_or(""),
        Some(Value::String(version)) if matches!(version.trim(), "" | "latest" | "head") => "",
        Some(Value::String(version)) => version.trim(),
        Some(_) => return Err(decline("status dependency version")),
    };
    Ok(if version.is_empty() { String::new() } else { format!("@{version}") })
}

fn strip_latest_or_head(text: &str) -> &str {
    let text = text.trim();
    text.strip_suffix("@latest")
        .or_else(|| text.strip_suffix("@head"))
        .unwrap_or(text)
}
