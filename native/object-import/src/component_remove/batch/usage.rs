//! The safety check before removing a new aspect used by retained components.
use super::super::invalid;
use serde_json::Value;
use std::io;
pub(super) fn validate(identities: &[String], components: &[Value]) -> io::Result<()> {
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
        if extensions
            .iter()
            .filter_map(extension_id)
            .any(|id| identities.contains(&id))
        {
            return Err(io::Error::other(format!(
                "Unable to remove {identity}.\nThis component is 1) an aspect 2) is used by other components, such as \"{identity}\" 3) it's a new component so it can't be installed as a package.\nRemoving this component from the workspace will disrupt the functionality of other components that depend on it, and resolving these issues may not be straightforward.\nIf you understand the risks and wish to proceed with the removal, please use the --force flag.\n",
            )));
        }
    }
    Ok(())
}
fn extension_id(value: &Value) -> Option<String> {
    if let Some(id) = value
        .as_str()
        .or_else(|| value["name"].as_str())
        .or_else(|| value["extensionId"].as_str())
    {
        return Some(id.split('@').next()?.to_owned());
    }
    let id = value
        .get("extensionId")
        .or_else(|| value.get("id"))?;
    Some(format!("{}/{}", id["scope"].as_str()?, id["name"].as_str()?))
}
