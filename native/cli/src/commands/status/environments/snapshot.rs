//! Select the callback boundary before snapshot control receipts are retained.
use super::{array, component, text};
use crate::commands::{
    engine::Engine,
    inventory::{Inventory, Options},
};
use serde_json::{Value, json};
use std::{io, path::Path};

pub(super) fn configured(engine: &mut Engine, root: &Path, context: &Value) -> io::Result<bool> {
    if crate::commands::update_cmd::aspect_entry(
        &context["workspace"],
        "teambit.defender/formatter",
    )
    .is_some_and(|(_, fmt)| fmt["formatOnPreSnap"] == true)
    {
        return Ok(true);
    }
    let targets = array(context.get("targets"), "snapshot callback targets")?;
    if targets.is_empty() {
        return Ok(false);
    }
    let options: Options =
        serde_json::from_value(context["options"].clone()).map_err(io::Error::other)?;
    let inventory = Inventory::new(&options)?;
    for target in targets {
        let component = component(root, context, target)?;
        if component.config
            .iter()
            .any(|(id, config)| {
                !matches!(
                    bit_install::policy::split_version(id).0,
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
    let raw_dir = text(
        target
            .get("directory")
            .filter(|val| !val.is_null())
            .or_else(|| target.get("rootDir")),
    )?
    .trim();
    if raw_dir.is_empty() {
        return Ok(false);
    }
    let trimmed = raw_dir.trim_start_matches("./").trim_end_matches('/');
    let directory = if trimmed.is_empty() { "." } else { trimmed };
    let location = root.join(directory);
    if !location.try_exists()? {
        return Ok(false);
    }
    let excludes = root_excludes(root, context, directory)?;
    let manifest = inventory.scan(
        engine,
        json!({"kind":"inventoryBegin","root":location,"workspace":root,"excludeDirs":excludes}),
        "inventoryFinish",
    )?;
    Ok(array(manifest.get("files"), "snapshot source names")?.iter().any(is_callback_source_file))
}

#[inline]
fn root_excludes(
    root: &Path,
    context: &Value,
    directory: &str,
) -> io::Result<Vec<std::path::PathBuf>> {
    if directory != "." {
        return Ok(Vec::new());
    }
    Ok(array(context.get("targets"), "snapshot inventory targets")?
        .iter()
        .filter_map(|row| {
            row["directory"]
                .as_str()
                .or_else(|| row["rootDir"].as_str())
        })
        .map(|dir| {
            dir.trim()
                .trim_start_matches("./")
                .trim_end_matches('/')
        })
        .filter(|dir| !dir.is_empty() && *dir != ".")
        .map(|dir| root.join(dir))
        .collect())
}

#[inline]
fn is_callback_source_file(file: &Value) -> bool {
    file["relativePath"]
        .as_str()
        .map(str::trim)
        .is_some_and(|name| {
            name.contains(".docs.")
                || name.contains(".composition.")
                || name.contains(".compositions.")
                || name.contains(".bit-app.")
                || name.contains(".node-app.")
                || name.contains(".react-app.")
        })
}
