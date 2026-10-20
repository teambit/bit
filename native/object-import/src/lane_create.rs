//! Create a local lane and publish its object, history and workspace metadata.
use crate::{inspection, recovery, store::Store, workspace::engine::command::outbound};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub struct Plan {
    root: PathBuf,
    scope: String,
    parent_name: Option<String>,
    objects: Objects,
    documents: Documents,
}

struct Objects {
    lane_hash: String,
    history_hash: String,
    lane: Value,
    history: Value,
}

struct Documents {
    index: Value,
    scope_json: Value,
    bitmap: Value,
}

struct Origin {
    parent_name: Option<String>,
    components: Vec<Value>,
    forked_from: Option<Value>,
}

#[derive(Clone, Copy)]
pub struct Options<'a> {
    pub alias: &'a str,
    pub fork_lane_new_scope: bool,
}

impl Plan {
    /// Prepare `LanesMain.createLane` without changing the workspace.
    pub fn prepare(
        root: &Path,
        name: &str,
        scope: &str,
        options: Options<'_>,
        log: Value,
        lane_hash: &str,
        history_key: &str,
    ) -> io::Result<Self> {
        validate(name, scope, options, lane_hash, history_key)?;
        let mut documents = Documents::read(root)?;
        let origin = Origin::read(root, &documents, scope, options.fork_lane_new_scope)?;
        let objects = Objects::new(name, scope, log, lane_hash, history_key, &origin)?;
        documents.add(name, scope, options.alias, lane_hash)?;
        Ok(Self {
            root: root.to_path_buf(),
            scope: scope.into(),
            parent_name: origin.parent_name,
            objects,
            documents,
        })
    }

    /// Publish the validated `Lane` and `LaneHistory` before their metadata references.
    pub fn commit(&self) -> io::Result<()> {
        let store = Store::new(bit_workspace_config::scope_path(&self.root).join("objects"), None)?;
        self.objects.persist(&store)?;
        self.documents.publish(&self.root, &store)
    }

    #[must_use]
    pub fn scope(&self) -> &str {
        &self.scope
    }

    #[must_use]
    pub fn parent_name(&self) -> Option<&str> {
        self.parent_name.as_deref()
    }
}

impl Documents {
    fn read(root: &Path) -> io::Result<Self> {
        let index = match fs::read(bit_workspace_config::scope_path(root).join("index.json")) {
            Ok(bytes) => serde_json::from_slice(&bytes)?,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                json!({"components":[],"lanes":[]})
            }
            Err(error) => return Err(error),
        };
        let scope_json: Value = serde_json::from_slice(&fs::read(
            bit_workspace_config::scope_path(root).join("scope.json"),
        )?)?;
        let bitmap = recovery::jsonc::parse(&fs::read(root.join(".bitmap"))?)?;
        if scope_json["lanes"]["current"] != "main" {
            return Err(invalid());
        }
        Ok(Self { index, scope_json, bitmap })
    }

    fn add(&mut self, name: &str, scope: &str, alias: &str, lane_hash: &str) -> io::Result<()> {
        let lanes = self.index["lanes"].as_array_mut().ok_or_else(invalid)?;
        if lanes
            .iter()
            .any(|row| row["id"]["name"] == name && row["id"]["scope"] == scope)
        {
            return Err(invalid());
        }
        let tracking = self.scope_json["lanes"]["tracking"].as_array_mut().ok_or_else(invalid)?;
        if tracking
            .iter()
            .any(|row| row["localLane"] == alias)
        {
            return Err(invalid());
        }
        let id = json!({"name":name,"scope":scope});
        lanes.push(json!({"id":id,"hash":lane_hash}));
        tracking.push(json!({"localLane":alias,"remoteLane":name,"remoteScope":scope}));
        self.scope_json["lanes"]["new"]
            .as_array_mut()
            .ok_or_else(invalid)?
            .push(json!(name));
        self.bitmap["_bit_lane"] = json!({"id":id,"exported":false});
        Ok(())
    }

    fn publish(&self, root: &Path, store: &Store) -> io::Result<()> {
        let mut index = serde_json::to_vec_pretty(&self.index)?;
        index.push(b'\n');
        store.write_index(&index)?;
        let mut scope_json = serde_json::to_vec_pretty(&self.scope_json)?;
        scope_json.push(b'\n');
        fs::write(bit_workspace_config::scope_path(root).join("scope.json"), scope_json)?;
        fs::write(root.join(".bitmap"), inspection::render_bitmap(&self.bitmap)?)?;
        Ok(())
    }
}

impl Origin {
    fn read(root: &Path, documents: &Documents, scope: &str, new_scope: bool) -> io::Result<Self> {
        if let Some(parent) = documents.bitmap.get("_bit_lane") {
            return Self::from_parent(root, &documents.index, parent, scope, new_scope);
        }
        check_main_staged(root, &documents.index)?;
        Ok(Self { parent_name: None, components: Vec::new(), forked_from: None })
    }

    fn from_parent(
        root: &Path,
        index: &Value,
        parent: &Value,
        scope: &str,
        new_scope: bool,
    ) -> io::Result<Self> {
        let parent_id = &parent["id"];
        let parent_name = parent_id["name"]
            .as_str()
            .ok_or_else(invalid)?
            .to_owned();
        let parent_scope = parent_id["scope"].as_str().ok_or_else(invalid)?;
        if scope != parent_scope && !new_scope {
            return Err(invalid());
        }
        let row = index["lanes"]
            .as_array()
            .ok_or_else(invalid)?
            .iter()
            .find(|row| row["id"] == *parent_id)
            .ok_or_else(invalid)?;
        let hash = row["hash"].as_str().ok_or_else(invalid)?;
        let objects_dir = bit_workspace_config::scope_path(root).join("objects");
        let lane = outbound::read_object(&objects_dir, hash, "Lane")?;
        let components = active_lane_components(&objects_dir, &lane)?;
        let forked_from = if parent["exported"] == true {
            Some(parent_id.clone())
        } else {
            lane.get("forkedFrom").cloned()
        };
        Ok(Self { parent_name: Some(parent_name), components, forked_from })
    }
}

fn active_lane_components(objects_dir: &Path, lane: &Value) -> io::Result<Vec<Value>> {
    let mut components = Vec::new();
    for entry in lane["components"].as_array().ok_or_else(invalid)? {
        let head = entry["head"].as_str().ok_or_else(invalid)?;
        let version = outbound::read_object(objects_dir, head, "Version")?;
        let removed = version["extensions"]
            .as_array()
            .is_some_and(|rows| {
                rows.iter()
                    .any(|row| {
                        row["name"] == "teambit.component/remove"
                            && row["config"]["removed"] == true
                    })
            });
        if !removed {
            components.push(entry.clone());
        }
    }
    Ok(components)
}

impl Objects {
    fn new(
        name: &str,
        scope: &str,
        mut log: Value,
        lane_hash: &str,
        history_key: &str,
        origin: &Origin,
    ) -> io::Result<Self> {
        log.as_object_mut()
            .ok_or_else(invalid)?
            .shift_remove("message");
        let mut history_log = log.clone();
        history_log["message"] = json!("new lane");
        let history_components = history_components(&origin.components)?;
        let mut lane = json!({"name":name,"scope":scope,"components":origin.components,"log":log,"schema":"1.0.0"});
        if let Some(forked_from) = &origin.forked_from {
            lane["forkedFrom"] = forked_from.clone();
        }
        let history = json!({"name":name,"scope":scope,"laneHash":lane_hash,"history":{history_key:{"log":history_log,"components":history_components,"updateDependents":[]}}});
        Ok(Self {
            lane_hash: lane_hash.into(),
            history_hash: hash(format!("{lane_hash}:LaneHistory").as_bytes()),
            lane,
            history,
        })
    }

    fn persist(&self, store: &Store) -> io::Result<()> {
        for (hash, kind, value) in [
            (&self.lane_hash, "Lane", &self.lane),
            (&self.history_hash, "LaneHistory", &self.history),
        ] {
            store.write(hash, &outbound::encode_object(hash, kind, value)?)?;
        }
        store.finish_batch()
    }
}

fn check_main_staged(root: &Path, index: &Value) -> io::Result<()> {
    for row in index["components"].as_array().ok_or_else(invalid)? {
        let hash = row["hash"].as_str().ok_or_else(invalid)?;
        let model = outbound::read_object(
            &bit_workspace_config::scope_path(root).join("objects"),
            hash,
            "Component",
        )?;
        if model["state"]["versions"]
            .as_object()
            .is_some_and(|rows| {
                rows.values()
                    .any(|row| row["local"] == true)
            })
        {
            return Err(invalid());
        }
    }
    Ok(())
}

fn history_components(components: &[Value]) -> io::Result<Vec<String>> {
    components
        .iter()
        .map(|entry| {
            let scope = entry["id"]["scope"].as_str().ok_or_else(invalid)?;
            let name = entry["id"]["name"].as_str().ok_or_else(invalid)?;
            let head = entry["head"].as_str().ok_or_else(invalid)?;
            Ok(format!("{scope}/{name}@{head}"))
        })
        .collect()
}

fn validate(
    name: &str,
    scope: &str,
    options: Options<'_>,
    lane_hash: &str,
    history_key: &str,
) -> io::Result<()> {
    if name == "main"
        || !valid_name(name)
        || !valid_name(options.alias)
        || !valid_scope(scope)
        || history_key.is_empty()
        || !valid_hash(lane_hash)
    {
        return Err(invalid());
    }
    Ok(())
}

fn invalid() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, "unsupported lane creation")
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha1::digest(bytes))
}
fn valid_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 800
        && value
            .bytes()
            .all(|byte| {
                byte.is_ascii_lowercase()
                    || byte.is_ascii_digit()
                    || matches!(byte, b'-' | b'_' | b'$' | b'!')
            })
}
fn valid_scope(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}
fn valid_hash(value: &str) -> bool {
    value.len() == 40
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}
