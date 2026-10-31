//! `AspectsMerger.merge` over captured model/configuration facts. The shared
//! installer merger owns origin precedence, removals, env filtering and ids.

#[cfg(test)]
mod tests;

use super::super::js::{array, decline, nullish, object, text, truthy};
use bit_install::{
    model::ComponentId,
    workspace::{
        aspects::{self, Merger, Origin, Resolver},
        by_root_dir_and_name,
    },
};
use serde_json::{Map, Value, json};
use std::io;

const CORES: &str =
    include_str!("../../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json");
const VARIANTS: &str = "teambit.workspace/variants";

pub(super) fn extensions(
    context: &Value,
    target: &Value,
    version: Option<&Value>,
) -> io::Result<Vec<Value>> {
    let id = component_id(target)?;
    let workspace = array(context.get("targets"), "projection targets")?
        .iter()
        .map(component_id)
        .collect::<io::Result<Vec<_>>>()?;
    let core: Vec<String> = serde_json::from_str(CORES).map_err(io::Error::other)?;
    let mut merger = Merger::new(Resolver { component: &id, workspace: &workspace });
    populate(&mut merger, &core, context, target, version, &id.name)?;
    merger
        .finish()
        .into_iter()
        .map(row)
        .collect()
}

fn populate(
    merger: &mut Merger<'_>,
    core: &[String],
    context: &Value,
    target: &Value,
    version: Option<&Value>,
    name: &str,
) -> io::Result<()> {
    add_config(merger, target.get("componentConfig"), core, Origin::BitmapFile, true)?;
    let identity = text(target.get("identity"))?;
    add_config(
        merger,
        context["pendingConfigurations"][identity].get("config"),
        core,
        Origin::ConfigMerge,
        false,
    )?;
    if target["resolveConfig"] == true {
        add_config(merger, target.get("mergedConfig"), core, Origin::ConfigMerge, false)?;
    }
    add_config(merger, target["config"].get("extensions"), core, Origin::ComponentJsonFile, true)?;
    let stored = aspects::from_model(array(
        version.and_then(|version| version.get("extensions")),
        "extensions",
    )?);
    let (specific, ordinary) = stored.into_iter().partition(aspects::is_specific);
    merger.add(specific, Origin::ModelSpecific);
    let propagate = !truthy(target.get("config")) || truthy(target["config"].get("propagate"));
    if add_variants(merger, context, target, name, core, propagate)? {
        merger.add(ordinary, Origin::ModelNonSpecific);
    }
    Ok(())
}

fn add_config(
    merger: &mut Merger<'_>,
    config: Option<&Value>,
    core: &[String],
    origin: Origin,
    specific: bool,
) -> io::Result<()> {
    let Some(config) = nullish(config) else { return Ok(()) };
    let mut entries = aspects::from_config_object(object(config)?, core);
    if specific {
        for entry in &mut entries {
            if let Some(config) = entry.config.as_object_mut() {
                config.insert("__specific".to_string(), json!(true));
            }
        }
    }
    merger.add(entries, origin);
    Ok(())
}

fn add_variants(
    merger: &mut Merger<'_>,
    context: &Value,
    target: &Value,
    name: &str,
    core: &[String],
    propagate: bool,
) -> io::Result<bool> {
    if !propagate {
        return Ok(false);
    }
    let Some(config) = nullish(
        crate::commands::update_cmd::aspect_entry(&context["workspace"], VARIANTS)
            .map(|(_, val)| val),
    ) else {
        return Ok(true);
    };
    let variants = object(config)?
        .iter()
        .map(|(pattern, value)| Ok((pattern.clone(), object(value)?.clone())))
        .collect::<io::Result<Vec<_>>>()?;
    let matched = by_root_dir_and_name(&variants, text(target.get("directory"))?, name)?;
    let lists = matched.extensions
        .iter()
        .map(|config| aspects::from_config_object(config, core))
        .collect();
    merger.add(aspects::merge_lists(lists), Origin::WorkspaceVariants);
    Ok(matched.propagate)
}

fn component_id(target: &Value) -> io::Result<ComponentId> {
    let identity = text(target.get("identity"))?;
    let (scope, name) =
        identity.split_once('/').ok_or_else(|| decline("projection scoped component"))?;
    Ok(ComponentId {
        scope: Some(scope.to_string()),
        default_scope: None,
        name: name.to_string(),
        version: target["version"]
            .as_str()
            .filter(|version| !version.is_empty() && !matches!(*version, "latest" | "head"))
            .map(str::to_string),
    })
}

fn row(entry: aspects::AspectEntry) -> io::Result<Value> {
    if entry.core {
        let bare = bit_install::config::aspect_id_without_version(&entry.id);
        let mut value = json!({"name":bare,"config":entry.config});
        if bare == "teambit.envs/envs" {
            value["data"] = entry.data;
        }
        return Ok(value);
    }
    let mut row = Map::new();
    row.insert("extensionId".to_string(), extension_id(&entry.id)?);
    row.insert("config".to_string(), entry.config);
    Ok(Value::Object(row))
}

pub(super) fn extension_id(id: &str) -> io::Result<Value> {
    let (identity, version) = id
        .rsplit_once('@')
        .map_or((id, None), |(id, version)| (id, Some(version)));
    let (scope, name) =
        identity.split_once('/').ok_or_else(|| decline("projection extension scope"))?;
    let mut value = json!({"scope":scope,"name":name});
    if let Some(version) =
        version.filter(|version| !version.is_empty() && !matches!(*version, "latest" | "head"))
    {
        value["version"] = json!(version);
    }
    Ok(value)
}
