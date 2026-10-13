use super::{Output, Request};
use crate::workspace::engine::{dependency_policy::wire::version, invalid};
use serde_json::Value;
use std::io;

pub(super) fn apply(request: &Request, output: &mut Output) -> io::Result<()> {
    for name in request.environment.policy.keys() {
        if version(&request.environment.policy, name).is_none() {
            continue;
        }
        for packages in &mut output.state.packages {
            packages.shift_remove(name);
        }
    }
    for (name, value) in &request.environment.policy {
        let value = if value == "+" { resolve(request, name)? } else { value.clone() };
        output.state.packages[0].insert(name.clone(), value);
    }
    Ok(())
}
fn resolve(request: &Request, name: &str) -> io::Result<Value> {
    if let Some(value) = request.resolved
        .get(name)
        .and_then(|package| package.concrete_version.as_ref())
        .filter(|value| !value.is_empty())
    {
        return Ok(Value::String(value.clone()));
    }
    if let Some(value) = version(&request.environment.workspace.dependencies, name)
        .or_else(|| version(&request.environment.workspace.peer_dependencies, name))
    {
        return Ok(Value::String(value));
    }
    if let Some(entry) = request.environment.model_components
        .iter()
        .find(|entry| entry.package_name.as_deref() == Some(name))
    {
        let (_, value) = entry.identity
            .rsplit_once('@')
            .ok_or_else(|| invalid("dependency policy model version unavailable"))?;
        return Ok(Value::String(value.to_owned()));
    }
    Ok(Value::String(
        version(&request.environment.model_packages, name).unwrap_or_else(|| "*".to_owned()),
    ))
}
