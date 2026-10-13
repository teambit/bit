use super::{invalid, wire::Complete};
use serde_json::Value;
use std::io;

pub(super) fn detected(request: &Complete) -> io::Result<Value> {
    if request.finish["selfIdentity"] != request.capture.identity {
        return Err(invalid("fresh dependency identity receipt"));
    }
    let mut detected = request.capture.detected.clone();
    if detected["issues"] != serde_json::json!([])
        || detected["coreAspects"] != serde_json::json!([])
    {
        return Err(invalid("fresh detection issue boundary"));
    }
    for version in &request.capture.component_versions {
        let field = ["dependencies", "devDependencies", "peerDependencies"]
            .get(version.field)
            .ok_or_else(|| invalid("fresh component lifecycle"))?;
        let id = detected["allDependencies"][field]
            .get_mut(version.index)
            .and_then(|dependency| dependency.get_mut("id"))
            .and_then(Value::as_object_mut)
            .ok_or_else(|| invalid("fresh component version receipt"))?;
        let chosen = match select(version.concrete.as_deref(), &request.resolution["grammar"])? {
            Some(value) => Some(value),
            None => select(version.dependent.as_deref(), &request.resolution["grammar"])?,
        };
        if let Some(version) = chosen {
            id.insert("version".to_owned(), Value::String(version));
        }
    }
    Ok(detected)
}
fn select(version: Option<&str>, grammar: &Value) -> io::Result<Option<String>> {
    let Some(version) = version.filter(|version| !version.is_empty()) else { return Ok(None) };
    if let Some(hash) = version.strip_prefix("0.0.0-").filter(|hash| snap(hash)) {
        return Ok(Some(hash.to_owned()));
    }
    let parsed = grammar.get(version).ok_or_else(|| invalid("fresh component version grammar"))?;
    if parsed["valid"] == true {
        return Ok(Some(version.to_owned()));
    }
    if parsed["range"] == true
        && let Some(coerced) = parsed["coerced"].as_str()
    {
        return Ok(Some(coerced.to_owned()));
    }
    Ok(snap(version).then(|| version.to_owned()))
}
fn snap(version: &str) -> bool {
    version.len() == 40 && version.bytes().all(|byte| byte.is_ascii_hexdigit())
}
