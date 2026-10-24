use super::{Value, invalid, json};
use crate::workspace::engine::command::capture::Captured;
use std::io;
pub(in crate::workspace::engine::command::merge_planning) fn prepare_hidden_metadata(
    current: &Captured,
    output: &mut Value,
) -> io::Result<()> {
    if !current.target.directory.is_empty() {
        return Err(invalid("hidden bitmap component requires scope reload projection"));
    }
    let resolver = output["extensions"]
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|row| row["name"] == "teambit.dependencies/dependency-resolver")
        })
        .map_or_else(|| json!([]), |row| row["data"]["dependencies"].clone());
    for field in ["dependencies", "devDependencies"] {
        let dependencies =
            output[field].as_array_mut().ok_or_else(|| invalid("hidden dependency list"))?;
        for dependency in dependencies {
            package_name(dependency, &resolver);
        }
    }
    Ok(())
}

fn package_name(dependency: &mut Value, resolver: &Value) {
    if dependency.get("packageName").is_some() {
        return;
    }
    if let Some(name) = resolver
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|row| row["__type"] == "component" && row["componentId"] == dependency["id"])
        })
        .and_then(|row| row["packageName"].as_str())
    {
        dependency["packageName"] = json!(name);
    }
}
