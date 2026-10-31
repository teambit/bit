//! `createConsumer`, bitmap repair/reset and package-json provisioning.
use super::{
    config,
    options::Options,
    plan::{Action, Plan, backup},
};
use serde_json::{Value, json};
use std::{fs, io, path::Path};

pub(super) fn prepare(plan: &mut Plan, scope: &Path, options: &Options) -> io::Result<()> {
    let path = plan.root.join("workspace.jsonc");
    let existing = if options.resets.hard { None } else { config::existing(&path)? };
    let bytes = existing.map_or_else(|| config::create(&plan.root, &plan.modules, options), Ok)?;
    let bytes = config::workspace_files(bytes, options)?;
    plan.actions.push(Action::Directory(scope.join("workspace-config-history/files")));
    if !options.resets.hard {
        backup(
            plan,
            scope,
            &path,
            "workspace-config-history/files",
            "workspace-config-history/metadata.txt",
            "",
        )?;
    }
    if options.flags.external_pm
        || options.defaults.directory
            .as_deref()
            .is_some_and(|value| value.starts_with("bit-components"))
    {
        super::plan::backup_bytes(
            plan,
            scope,
            "workspace-config-history/files",
            "workspace-config-history/metadata.txt",
            "",
            bytes.clone(),
        );
    }
    plan.actions.push(Action::File(path, bytes));
    bitmap(plan, scope, options)?;
    package(plan, options)?;
    Ok(())
}

fn bitmap(plan: &mut Plan, scope: &Path, options: &Options) -> io::Result<()> {
    plan.actions.push(Action::Directory(scope.join("bitmap-history")));
    let mut path = plan.root.join(".bitmap");
    if !path.exists() && plan.root.join(".bit.map.json").exists() {
        path = plan.root.join(".bit.map.json");
    }
    let original = fs::read(&path).ok();
    let parsed = original
        .as_deref()
        .map(bit_workspace_config::parse_jsonc)
        .transpose();
    let valid_original = parsed.is_ok();
    let mut value = if options.resets.hard || (options.resets.repair && parsed.is_err()) {
        json!({"$schema-version":"17.0.0"})
    } else {
        parsed?.unwrap_or_else(|| json!({"$schema-version":"17.0.0"}))
    };
    if options.resets.new || options.resets.lane_new {
        reset_new(&mut value, options.resets.lane_new)?;
    }
    validate_objects(&value, scope, options)?;
    if original.is_some() && !options.resets.hard && valid_original {
        backup(plan, scope, &path, "bitmap-history", "bitmap-history-metadata.txt", ".bitmap-")?;
    }
    plan.actions.push(Action::File(path, bit_object_import::render_workspace_bitmap(&value)?));
    Ok(())
}

fn validate_objects(value: &Value, scope: &Path, options: &Options) -> io::Result<()> {
    let clears_scope = options.resets.scope
        || options.resets.hard
        || options.resets.new
        || options.resets.lane_new;
    if !options.flags.force && !clears_scope && empty(value) && retained_objects(scope)? {
        if options.resets.repair {
            return Err(io::Error::other(
                "init empty bitmap with retained objects requires --force or --reset-hard",
            ));
        }
        return Err(io::Error::other(
            "error: unable to init a bit workspace, the scope already has objects. please use --force if you want to init an empty workspace",
        ));
    }
    Ok(())
}

fn empty(value: &Value) -> bool {
    value
        .as_object()
        .is_some_and(|rows| {
            rows.keys()
                .all(|key| key.starts_with('$') || key == "_bit_lane" || key == "version")
        })
}
fn reset_new(value: &mut Value, lane_only: bool) -> io::Result<()> {
    let rows = value.as_object_mut().ok_or_else(|| io::Error::other("init bitmap object"))?;
    for (key, row) in rows.iter_mut() {
        if key.starts_with('$') || key == "_bit_lane" || key == "version" || !row.is_object() {
            continue;
        }
        if lane_only && row["isAvailableOnCurrentLane"] != false {
            continue;
        }
        *row = reset_component_row(key, row);
    }
    if lane_only {
        rows.shift_remove("_bit_lane");
    }
    Ok(())
}

fn reset_component_row(key: &str, row: &Value) -> Value {
    let trimmed_key = key.trim();
    let key_id = trimmed_key.rsplit_once('@').map_or(trimmed_key, |(id, _)| id.trim());
    let key_scope = key_id
        .split_once('/')
        .map(|(scope, _)| scope.trim())
        .filter(|scope| !scope.is_empty());
    let scope = row["scope"]
        .as_str()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .or_else(|| {
            row["defaultScope"]
                .as_str()
                .map(str::trim)
                .filter(|scope| !scope.is_empty())
        })
        .or(key_scope)
        .map(str::to_owned);
    let name = row["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| {
            scope
                .as_deref()
                .and_then(|scope_str| key_id.strip_prefix(&format!("{scope_str}/")))
                .map_or(key_id, str::trim)
        })
        .to_owned();
    let mut fresh = json!({"name":name,"scope":"","version":"","rootDir":row["rootDir"],"mainFile":row["mainFile"]});
    if let Some(scope) = scope
        .as_deref()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
    {
        fresh["defaultScope"] = json!(scope);
    }
    fresh
}

fn package(plan: &mut Plan, options: &Options) -> io::Result<()> {
    let path = plan.root.join("package.json");
    let original = fs::read(&path).ok();
    let existing = original
        .as_deref()
        .map(bit_object_import::parse_jsonc)
        .transpose()?;
    if options.flags.no_package_json
        && existing.is_none()
        && !options.resets.repair
        && !options.resets.hard
    {
        return Ok(());
    }
    let mut value = existing
        .clone()
        .unwrap_or_else(|| json!({"type":"module"}));
    configure_package(&mut value, options, existing.is_some(), &mut plan.warning)?;
    if (!options.flags.no_package_json || existing.is_some())
        && value
            .as_object()
            .is_some_and(|value| !value.is_empty())
    {
        let original = if options.flags.external_pm { None } else { original.as_deref() };
        let bytes = super::package::render(&value, original)?;
        plan.actions.push(Action::File(path, bytes));
    }
    Ok(())
}

fn configure_package(
    value: &mut Value,
    options: &Options,
    existing: bool,
    warning: &mut String,
) -> io::Result<()> {
    if options.resets.repair || options.resets.hard {
        value
            .as_object_mut()
            .ok_or_else(|| io::Error::other("init package object"))?
            .shift_remove("bit");
    }
    if options.flags.external_pm && !options.flags.no_package_json {
        value["scripts"]["postinstall"] = json!("bit link && bit compile && bit ws-config write");
    } else if existing && value["type"] != "module" && !options.flags.no_package_json {
        "\nEnable ESM by adding \"type\":\"module\" to the package.json file (https://nodejs.org/api/esm.html#enabling). If you are looking to use CJS. Use the Bit CJS environments.".clone_into(warning);
    }
    Ok(())
}

fn retained_objects(scope: &Path) -> io::Result<bool> {
    let path = scope.join("objects");
    Ok(path.is_dir() && fs::read_dir(path)?.next().is_some())
}
