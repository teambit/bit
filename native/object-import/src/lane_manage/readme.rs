//! Remove the readme component reference from a local lane (`bit lane remove-readme`).
use super::{Documents, Objects, Original, history_components, invalid};
use crate::{inspection, store::Store};
use serde_json::{Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub enum ReadmePlan {
    NoReadme(String),
    Remove(Box<ReadmeRemoval>),
}

pub struct ReadmeRemoval {
    root: PathBuf,
    label: String,
    objects: Objects,
    bitmap: Value,
}

impl ReadmeRemoval {
    #[must_use]
    pub fn label(&self) -> &str {
        &self.label
    }
}

impl ReadmePlan {
    pub fn prepare(
        root: &Path,
        lane_name: Option<&str>,
        log: Value,
        history_key: &str,
    ) -> io::Result<Self> {
        if history_key.is_empty() {
            return Err(invalid());
        }
        let documents = Documents::read(root)?;
        let (label, target) = resolve_target(&documents, lane_name)?;
        if target.name == "main" {
            return Ok(Self::NoReadme(label));
        }
        let Ok(lane_hash) = documents.lane_hash(&target) else {
            return Ok(Self::NoReadme(label));
        };
        let mut objects = Objects::read(root, &lane_hash, &target)?;
        let Some(readme) = objects.lane
            .get("readmeComponent")
            .filter(|value| !value.is_null())
            .cloned()
        else {
            return Ok(Self::NoReadme(label));
        };
        let mut bitmap = documents.bitmap;
        remove_readme_from_bitmap(root, &mut bitmap, &target, &readme)?;
        record_readme_removal(&mut objects, log, history_key)?;
        Ok(Self::Remove(Box::new(ReadmeRemoval { root: root.into(), label, objects, bitmap })))
    }

    pub fn commit(&self) -> io::Result<()> {
        let Self::Remove(removal) = self else {
            return Ok(());
        };
        let ReadmeRemoval { root, objects, bitmap, .. } = removal.as_ref();
        let store = Store::new(bit_workspace_config::scope_path(root).join("objects"), None)?;
        objects.persist(&store)?;
        fs::write(root.join(".bitmap"), inspection::render_bitmap(bitmap)?)
    }
}

fn resolve_target(
    documents: &Documents,
    lane_name: Option<&str>,
) -> io::Result<(String, Original)> {
    let (current_name, current_scope) = documents.current_or_default()?;
    let label = lane_name.unwrap_or(&current_name).to_owned();
    let (name, scope) = match lane_name {
        Some(requested) => documents.resolve_lane_id(requested)?,
        None => (current_name, current_scope),
    };
    Ok((label, Original { name, scope }))
}

fn record_readme_removal(
    objects: &mut Objects,
    mut log: Value,
    history_key: &str,
) -> io::Result<()> {
    objects.lane
        .as_object_mut()
        .ok_or_else(invalid)?
        .remove("readmeComponent");
    let components = history_components(&objects.lane)?;
    let dependents = objects.lane["updateDependents"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let items = objects.history["history"].as_object_mut().ok_or_else(invalid)?;
    if items.contains_key(history_key) {
        return Err(invalid());
    }
    log["message"] = json!("remove readme");
    items.insert(
        history_key.into(),
        json!({"log":log,"components":components,"updateDependents":dependents}),
    );
    Ok(())
}

fn remove_readme_from_bitmap(
    root: &Path,
    bitmap: &mut Value,
    target: &Original,
    readme: &Value,
) -> io::Result<()> {
    let entry = find_readme_bitmap_entry(bitmap, readme)?;
    if let Some(root_dir) = entry["rootDir"].as_str()
        && root
            .join(root_dir)
            .join("component.json")
            .exists()
    {
        return Err(invalid());
    }
    let remote_lane_id = format!("{}/{}", target.scope, target.name);
    if let Some(cfg_obj) = entry.get_mut("config").and_then(Value::as_object_mut)
        && let Some((_, lanes)) = cfg_obj
            .iter_mut()
            .find(|(key, _)| {
                key.as_str() == "teambit.lanes/lanes" || key.starts_with("teambit.lanes/lanes@")
            })
        && let Some(readme_cfg) = lanes.get_mut("readme").and_then(Value::as_object_mut)
    {
        readme_cfg.remove(&remote_lane_id);
    }
    Ok(())
}

fn find_readme_bitmap_entry<'a>(
    bitmap: &'a mut Value,
    readme: &Value,
) -> io::Result<&'a mut Value> {
    let readme_name = readme["id"]["name"].as_str().ok_or_else(invalid)?;
    let readme_scope = readme["id"]["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty());
    let map = bitmap.as_object_mut().ok_or_else(invalid)?;
    map.iter_mut()
        .find(|(key, value)| readme_row_matches(key, value, readme_name, readme_scope))
        .map(|(_, value)| value)
        .ok_or_else(invalid)
}

fn readme_row_matches(
    key: &str,
    value: &Value,
    readme_name: &str,
    readme_scope: Option<&str>,
) -> bool {
    if key.starts_with('$')
        || matches!(key, "version" | "_bit_lane")
        || !value.is_object()
        || value["isAvailableOnCurrentLane"] == false
        || crate::workspace::engine::client_status::config::is_config_removed(&value["config"])
    {
        return false;
    }
    let (row_scope, row_name) = crate::reset_lane::bitmap::row_identity(key, value);
    row_name == readme_name
        && (readme_scope.is_none() || row_scope.is_none() || row_scope == readme_scope)
}
