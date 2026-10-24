//! Select the callback boundary before snapshot control receipts are retained.
use super::{array, component, text};
use crate::commands::{
    engine::Engine,
    inventory::{Inventory, Options},
};
use serde_json::{Value, json};
use std::{io, path::Path};

pub(super) fn configured(engine: &mut Engine, root: &Path, context: &Value) -> io::Result<bool> {
    if context["workspace"]["teambit.defender/formatter"]["formatOnPreSnap"] == true {
        return Ok(true);
    }
    let options: Options =
        serde_json::from_value(context["options"].clone()).map_err(io::Error::other)?;
    let inventory = Inventory::new(&options)?;
    for target in array(context.get("targets"), "snapshot callback targets")? {
        let component = component(root, context, target)?;
        if component.config
            .iter()
            .any(|(id, config)| {
                !matches!(
                    id.as_str(),
                    "teambit.envs/envs"
                        | "teambit.harmony/node"
                        | "teambit.dependencies/dependency-resolver"
                        | "teambit.component/remove"
                        | "teambit.component/deprecation"
                        | "teambit.component/issues",
                ) && config
                    .as_object()
                    .is_some_and(|config| !config.is_empty())
            })
        {
            return Ok(true);
        }
        if source_callbacks(engine, root, context, target, &inventory)? {
            return Ok(true);
        }
    }
    Ok(false)
}

fn source_callbacks(
    engine: &mut Engine,
    root: &Path,
    context: &Value,
    target: &Value,
    inventory: &Inventory,
) -> io::Result<bool> {
    let directory = text(target.get("directory"))?;
    let location = root.join(directory);
    if !location.try_exists()? {
        return Ok(false);
    }
    let excludes = if directory == "." {
        array(context.get("targets"), "snapshot inventory targets")?
            .iter()
            .filter_map(|target| target["directory"].as_str())
            .filter(|dir| *dir != ".")
            .map(|dir| root.join(dir))
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    let manifest = inventory.scan(
        engine,
        json!({"kind":"inventoryBegin","root":location,"workspace":root,"excludeDirs":excludes}),
        "inventoryFinish",
    )?;
    Ok(array(manifest.get("files"), "snapshot source names")?
        .iter()
        .any(|file| {
            file["relativePath"]
                .as_str()
                .is_some_and(|name| {
                    name.contains(".docs.")
                        || name.contains(".composition.")
                        || name.contains(".compositions.")
                        || name.contains(".bit-app.")
                        || name.contains(".node-app.")
                        || name.contains(".react-app.")
                })
        }))
}
