//! Safety check ([`validate`]) before removing a new aspect component used by retained workspace components.
use super::super::invalid;
use serde_json::Value;
use std::io;
/// Rejects removing a new aspect component when retained workspace `components` still use it.
pub(in crate::component_remove) fn validate(
    identities: &[String],
    components: &[Value],
) -> io::Result<()> {
    for component in components {
        let Some(identity) = component["identity"]
            .as_str()
            .or_else(|| component["id"].as_str())
            .map(str::trim)
            .filter(|id| !id.is_empty())
        else {
            return Err(invalid("stash removal component identity"));
        };
        let bare = bare_id(identity);
        if identities
            .iter()
            .any(|removed| bare_id(removed) == bare)
        {
            continue;
        }
        let Some(extensions) = component["extensions"].as_array() else {
            return Err(invalid("stash removal component aspects"));
        };
        if let Some(used) = used_removed_aspect(identities, extensions) {
            return Err(io::Error::other(format!(
                "Unable to remove {used}.\nThis component is 1) an aspect 2) is used by other components, such as \"{identity}\" 3) it's a new component so it can't be installed as a package.\nRemoving this component from the workspace will disrupt the functionality of other components that depend on it, and resolving these issues may not be straightforward.\nIf you understand the risks and wish to proceed with the removal, please use the --force flag.\n",
            )));
        }
    }
    Ok(())
}

/// Strip any `@version` suffix from `id` and return the trimmed bare component identity.
#[inline]
fn bare_id(id: &str) -> &str {
    let trimmed = id.trim();
    trimmed.rsplit_once('@').map_or(trimmed, |(prefix, _)| prefix.trim())
}

/// Return the first removed component ID in `identities` that is referenced as an aspect in `extensions`.
fn used_removed_aspect<'a>(identities: &'a [String], extensions: &[Value]) -> Option<&'a str> {
    if identities.is_empty() || extensions.is_empty() {
        return None;
    }
    let ext_ids: Vec<String> = extensions
        .iter()
        .filter_map(extension_id)
        .collect();
    identities
        .iter()
        .find(|removed| {
            let target = bare_id(removed);
            ext_ids.iter().any(|id| id == target)
        })
        .map(|removed| removed.trim())
}
fn extension_id(value: &Value) -> Option<String> {
    if let Some(id) = value
        .as_str()
        .or_else(|| value["name"].as_str())
        .or_else(|| value["legacyId"].as_str())
        .or_else(|| value["extensionId"].as_str())
        .map(str::trim)
        .filter(|id| !id.is_empty())
    {
        let bare = match id.rsplit_once('@') {
            Some((prefix, _)) if !prefix.trim().is_empty() => prefix.trim(),
            _ => id,
        };
        return (!bare.is_empty()).then(|| bare.to_owned());
    }
    let id = value
        .get("extensionId")
        .or_else(|| value.get("id"))?;
    let raw_name = id["name"].as_str()?.trim();
    let name = match raw_name.rsplit_once('@') {
        Some((prefix, _)) if !prefix.trim().is_empty() => prefix.trim(),
        _ => raw_name,
    };
    if name.is_empty() {
        return None;
    }
    match id["scope"]
        .as_str()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
    {
        Some(scope) => Some(format!("{scope}/{name}")),
        None => Some(name.to_owned()),
    }
}
