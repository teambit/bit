use super::{Plan, identity, invalid, unsupported};
use serde_json::{Value, json};
use std::{
    fs,
    io::{self, Write},
};

pub(super) fn prepare(plan: &mut Plan, facts: &Value) -> io::Result<()> {
    let (source_key, source) = identity::selected(&plan.controls.bitmap, &plan.identity.source)?;
    let source_key = source_key.to_owned();
    let source_root = source["rootDir"].clone();
    let source_main = source["mainFile"].clone();
    let target = target_row(plan, source, facts)?;
    let rows = plan.controls.bitmap.as_object_mut().ok_or_else(|| unsupported("rename bitmap"))?;
    if !plan.identity.exported {
        rows.shift_remove(&source_key);
    }
    let tracked_target = format!(
        "{}/{}",
        target["defaultScope"].as_str().unwrap_or_default(),
        plan.identity.target_name,
    );
    let target_key = target_key(rows, &plan.identity.target_name, &tracked_target)?;
    if rows.contains_key(&target_key) {
        return Err(invalid(format!("component {} already exists", plan.identity.target)));
    }
    rows.insert(target_key.clone(), target);
    plan.controls.initial = plan.controls.bitmap.clone();
    if !plan.identity.exported {
        plan.controls.initial[&target_key]["rootDir"] = source_root;
        plan.controls.initial[&target_key]["mainFile"] = source_main;
    }
    rename_aspects(plan);
    if plan.identity.exported {
        remove_or_deprecate(plan)?;
    }
    Ok(())
}
fn target_row(plan: &Plan, source: &Value, facts: &Value) -> io::Result<Value> {
    let mut target = source.clone();
    target["name"] = json!(plan.identity.target_name);
    target["scope"] = json!("");
    target["version"] = json!("");
    target["defaultScope"] = json!(
        plan.identity.target
            .split('/')
            .next()
            .unwrap_or_default()
    );
    if plan.identity.exported
        && let Some(scope) = facts["trackingDefaultScope"].as_str()
    {
        target["defaultScope"] = json!(scope);
    }
    target["rootDir"] = json!(plan.identity.target_directory);
    if let Some(main) = source["mainFile"].as_str() {
        target["mainFile"] = json!(if plan.options.preserve {
            main.into()
        } else {
            super::refactor::filename(
                main,
                plan.identity.source_name
                    .rsplit('/')
                    .next()
                    .unwrap_or_default(),
                plan.identity.target_name
                    .rsplit('/')
                    .next()
                    .unwrap_or_default(),
            )?
        });
    }
    if plan.identity.exported {
        exported_config(plan, &mut target, facts)?;
    }
    Ok(target)
}
fn exported_config(plan: &Plan, target: &mut Value, facts: &Value) -> io::Result<()> {
    // Tracker creates a fresh ComponentMap rather than inheriting the source lane membership.
    if let Some(row) = target.as_object_mut() {
        row.shift_remove("onLanesOnly");
        row.shift_remove("isAvailableOnCurrentLane");
    }
    let mut config = copied_config(facts)?;
    let (scope, name) = plan.identity.source
        .split_once('/')
        .ok_or_else(|| unsupported("rename source identity"))?;
    let mut source = json!({"scope":scope,"name":name});
    if let Some(version) = facts["sourceVersion"]
        .as_str()
        .filter(|version| !version.is_empty())
    {
        source["version"] = json!(version);
    }
    config.insert("teambit.component/renaming".into(), json!({"renamedFrom":source}));
    target["config"] = Value::Object(config);
    Ok(())
}
fn copied_config(facts: &Value) -> io::Result<serde_json::Map<String, Value>> {
    let mut config = serde_json::Map::new();
    if let Some(entries) = facts["sourceConfigs"].as_array() {
        for entry in entries {
            let name = entry["id"]
                .as_str()
                .ok_or_else(|| unsupported("rename producer aspect identity"))?;
            copy_config(&mut config, name, &entry["config"]);
        }
        return Ok(config);
    }
    for extension in facts["sourceExtensions"]
        .as_array()
        .into_iter()
        .flatten()
    {
        let name = extension["name"]
            .as_str()
            .map(str::to_owned)
            .or_else(|| aspect_id(&extension["extensionId"]))
            .ok_or_else(|| unsupported("rename captured aspect identity"))?;
        if extension["config"].is_object() {
            copy_config(&mut config, &name, &extension["config"]);
        }
    }
    Ok(config)
}
fn copy_config(config: &mut serde_json::Map<String, Value>, name: &str, value: &Value) {
    if !matches!(name, "teambit.pkg/pkg" | "teambit.component/renaming") && !value.is_null() {
        config.insert(name.into(), value.clone());
    }
}
fn aspect_id(value: &Value) -> Option<String> {
    let name = value["name"].as_str()?;
    let mut id = value["scope"]
        .as_str()
        .map_or_else(|| name.to_owned(), |scope| format!("{scope}/{name}"));
    if let Some(version) = value["version"].as_str() {
        id.push('@');
        id.push_str(version);
    }
    Some(id)
}
fn remove_or_deprecate(plan: &mut Plan) -> io::Result<()> {
    if plan.options.deprecate {
        return crate::component_deprecation::set_config(
            &mut plan.controls.bitmap,
            &plan.identity.source,
            Some(&plan.identity.target),
            None,
            false,
        );
    }
    let (key, _) = identity::selected(&plan.controls.bitmap, &plan.identity.source)?;
    let key = key.to_owned();
    let row = &mut plan.controls.bitmap[&key];
    if !row["config"].is_object() {
        row["config"] = json!({});
    }
    row["config"]["teambit.component/remove"] = json!({"removed":true,"removeOnMain":true});
    Ok(())
}
fn rename_aspects(plan: &mut Plan) {
    if let Some(rows) = plan.controls.bitmap.as_object_mut() {
        for row in rows.values_mut() {
            if let Some(config) = row.get_mut("config") {
                replace_config(config, &plan.identity.source, &plan.identity.target, true);
            }
        }
    }
    replace_config(
        &mut plan.controls.workspace,
        &plan.identity.source,
        &plan.identity.target,
        false,
    );
}
pub(super) fn replace_config(config: &mut Value, source: &str, target: &str, rename_env: bool) {
    let Some(config) = config.as_object_mut() else { return };
    if let Some(value) = config.shift_remove(source) {
        config.insert(target.into(), value);
    }
    if rename_env
        && let Some(env) = config.get_mut("teambit.envs/envs")
        && env["env"] == source
    {
        env["env"] = json!(target);
    }
    if let Some(envs) = config
        .get_mut("teambit.generator/generator")
        .and_then(|config| config.get_mut("envs"))
        .and_then(Value::as_array_mut)
        && let Some(value) = envs
            .iter_mut()
            .find(|value| **value == source)
    {
        *value = json!(target);
    }
}
pub(super) fn publish(plan: &mut Plan, file_id: &str) -> io::Result<()> {
    if plan.controls.workspace_published {
        return Ok(());
    }
    if fs::read(plan.root.join("workspace.jsonc"))? != plan.controls.workspace_before {
        return Err(unsupported("rename workspace configuration changed before publication"));
    }
    let original = crate::parse_jsonc(&plan.controls.workspace_before)?;
    if original == plan.controls.workspace {
        plan.controls.workspace_published = true;
        return Ok(());
    }
    let text = std::str::from_utf8(&plan.controls.workspace_before).map_err(io::Error::other)?;
    let mut document = crate::jsonc::Document::parse(text)?;
    let source = &plan.identity.source;
    if let Some(value) = plan.controls.workspace.get(&plan.identity.target) {
        document.remove(&[source]);
        document.set(&[&plan.identity.target], value);
    }
    publish_environment_config(&mut document, &original, &plan.controls.workspace);
    let bytes =
        crate::checkout::eol::normalize(format!("{document}\n").into_bytes(), cfg!(windows));
    let _ = backup(plan, file_id);
    fs::write(plan.root.join("workspace.jsonc"), bytes)?;
    plan.controls.workspace_published = true;
    Ok(())
}

fn publish_environment_config(
    document: &mut crate::jsonc::Document,
    original: &Value,
    target: &Value,
) {
    let aspect = "teambit.generator/generator";
    if original[aspect]["envs"] != target[aspect]["envs"] {
        document.set(&[aspect, "envs"], &target[aspect]["envs"]);
    }
}

fn backup(plan: &Plan, file_id: &str) -> io::Result<()> {
    let base = crate::scope_path(&plan.root).join("workspace-config-history");
    fs::create_dir_all(base.join("files"))?;
    fs::write(base.join("files").join(file_id), &plan.controls.workspace_before)?;
    let mut metadata = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(base.join("metadata.txt"))?;
    writeln!(metadata, "{file_id} rename")
}

pub(super) fn target_key(
    rows: &mut serde_json::Map<String, Value>,
    name: &str,
    target: &str,
) -> io::Result<String> {
    let similar = rows
        .iter()
        .filter(|(key, row)| row["name"].as_str().unwrap_or(key) == name)
        .map(|(key, row)| {
            let scope =
                identity::scope(row).ok_or_else(|| unsupported("rename duplicate name scope"))?;
            Ok((key.clone(), format!("{scope}/{name}")))
        })
        .collect::<io::Result<Vec<_>>>()?;
    if similar.is_empty() {
        return Ok(name.into());
    }
    for (key, qualified) in similar {
        if let Some(row) = rows.shift_remove(&key) {
            rows.insert(qualified, row);
        }
    }
    Ok(target.into())
}
