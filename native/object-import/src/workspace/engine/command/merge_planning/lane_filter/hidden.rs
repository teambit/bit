use super::{Value, invalid, json};
use crate::workspace::engine::command::capture::Captured;
use std::io;
pub(in crate::workspace::engine::command::merge_planning) fn prepare_hidden_metadata(
    current: &Captured,
    versions: &[Value; 3],
    output: &mut Value,
) -> io::Result<()> {
    if !current.target.directory.is_empty() {
        return Err(invalid("hidden bitmap component requires scope reload projection"));
    }
    let configurations = versions
        .iter()
        .map(configurations)
        .collect::<io::Result<Vec<_>>>()?;
    if configurations
        .iter()
        .any(|rows| *rows != configurations[1])
    {
        return Err(invalid("hidden merged configuration requires scope projection"));
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

fn configurations(version: &Value) -> io::Result<Vec<Value>> {
    version["extensions"]
        .as_array()
        .ok_or_else(|| invalid("hidden extensions"))?
        .iter()
        .map(configuration)
        .collect()
}
fn configuration(row: &Value) -> io::Result<Value> {
    let name = row["name"].as_str().ok_or_else(|| invalid("hidden custom aspect"))?;
    if ![
        "teambit.envs/envs",
        "teambit.dependencies/dependency-resolver",
        "teambit.component/dev-files",
        "teambit.semantics/schema",
        "teambit.pkg/pkg",
        "teambit.preview/preview",
        "teambit.compositions/compositions",
        "teambit.docs/docs",
        "teambit.pipelines/builder",
    ]
    .contains(&name)
    {
        return Err(invalid("hidden custom aspect callback"));
    }
    if name == "teambit.envs/envs"
        && row["data"]["id"]
            .as_str()
            .is_some_and(|id| id != "teambit.harmony/node")
    {
        return Err(invalid("hidden custom environment"));
    }
    Ok(json!({"name":name,"config":row["config"]}))
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
