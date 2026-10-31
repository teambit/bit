//! The safety check before removing a new aspect used by retained components.
use super::super::invalid;
use serde_json::Value;
use std::io;
pub(in crate::component_remove) fn validate(
    identities: &[String],
    components: &[Value],
) -> io::Result<()> {
    for component in components {
        let Some(identity) = component["identity"].as_str() else {
            return Err(invalid("stash removal component identity"));
        };
        if identities
            .iter()
            .any(|removed| removed == identity)
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

fn used_removed_aspect<'a>(identities: &'a [String], extensions: &[Value]) -> Option<&'a str> {
    identities
        .iter()
        .find(|removed| {
            extensions
                .iter()
                .filter_map(extension_id)
                .any(|id| *removed == &id)
        })
        .map(String::as_str)
}
fn extension_id(value: &Value) -> Option<String> {
    if let Some(id) = value
        .as_str()
        .or_else(|| value["name"].as_str())
        .or_else(|| value["legacyId"].as_str())
        .or_else(|| value["extensionId"].as_str())
    {
        return Some(id.split('@').next()?.to_owned());
    }
    let id = value
        .get("extensionId")
        .or_else(|| value.get("id"))?;
    let name = id["name"].as_str()?.split('@').next()?;
    match id["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
    {
        Some(scope) => Some(format!("{scope}/{name}")),
        None => Some(name.to_owned()),
    }
}
