//! Create a local lane and publish its object, history and workspace metadata.

mod origin;
mod staged;

use self::origin::{Origin, read_merge_move_backup};
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
    restored_parent: Option<(String, Vec<u8>)>,
    moved: staged::Moved,
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
        let mut origin = Origin::read(root, &documents, scope, options.fork_lane_new_scope)?;
        let moved = if origin.parent_name.is_none() {
            staged::prepare(root, &documents, name, scope, lane_hash)?
        } else {
            staged::Moved::default()
        };
        origin.components.extend(moved.components.clone());
        let objects = Objects::new(name, scope, log, lane_hash, history_key, &origin)?;
        documents.add(name, scope, options.alias, lane_hash)?;
        Ok(Self {
            root: root.to_path_buf(),
            scope: scope.into(),
            parent_name: origin.parent_name,
            objects,
            documents,
            restored_parent: None,
            moved,
        })
    }

    /// Prepare `MergeLanesMain.mergeMove`: restore the pre-merge lane object and create the new lane.
    pub fn prepare_merge_move(
        root: &Path,
        name: &str,
        scope: &str,
        log: Value,
        lane_hash: &str,
        history_key: &str,
    ) -> io::Result<Self> {
        let options = Options { alias: name, fork_lane_new_scope: false };
        validate(name, scope, options, lane_hash, history_key)?;
        let mut documents = Documents::read(root)?;
        let (parent_hash, backup_bytes, backup_lane) =
            read_merge_move_backup(root, &documents.index, &documents.bitmap)?;
        let origin = Origin::from_backup_lane(root, &documents.bitmap, &backup_lane, scope)?;
        let objects = Objects::new(name, scope, log, lane_hash, history_key, &origin)?;
        documents.add(name, scope, name, lane_hash)?;
        Ok(Self {
            root: root.to_path_buf(),
            scope: scope.into(),
            parent_name: origin.parent_name,
            objects,
            documents,
            restored_parent: Some((parent_hash, backup_bytes)),
            moved: staged::Moved::default(),
        })
    }

    /// Publish the validated `Lane` and `LaneHistory` before their metadata references.
    pub fn commit(&self) -> io::Result<()> {
        self.moved.validate()?;
        let store = Store::new(bit_workspace_config::scope_path(&self.root).join("objects"), None)?;
        if let Some((parent_hash, backup_bytes)) = &self.restored_parent {
            store.write(parent_hash, backup_bytes)?;
        }
        self.objects.persist(&store)?;
        self.moved.persist(&store)?;
        self.documents.publish(&self.root, &store)
    }

    #[must_use]
    pub fn scope(&self) -> &str {
        &self.scope
    }

    /// Component identities whose unexported main snaps move into this lane.
    #[must_use]
    pub fn moved_from_main(&self) -> Vec<String> {
        self.moved.components
            .iter()
            .map(|row| {
                let (row_scope, row_name) = origin::id_scope_and_name(&row["id"]);
                format!("{row_scope}/{row_name}")
            })
            .collect()
    }

    #[must_use]
    pub fn parent_name(&self) -> Option<&str> {
        self.parent_name.as_deref()
    }
}

impl Documents {
    fn read(root: &Path) -> io::Result<Self> {
        let mut index = match fs::read(bit_workspace_config::scope_path(root).join("index.json")) {
            Ok(bytes) => match crate::parse_jsonc(&bytes)? {
                Value::Array(components) => json!({"components":components,"lanes":[]}),
                value => value,
            },
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                json!({"components":[],"lanes":[]})
            }
            Err(error) => return Err(error),
        };
        if index.is_object() && index.get("lanes").is_none_or(Value::is_null) {
            index["lanes"] = json!([]);
        }
        let scope_json: Value = recovery::jsonc::parse(&fs::read(
            bit_workspace_config::scope_path(root).join("scope.json"),
        )?)?;
        let bitmap = recovery::jsonc::parse(&fs::read(root.join(".bitmap"))?)?;
        if scope_json["lanes"]["current"]
            .as_str()
            .is_some_and(|current| !current.is_empty() && current != "main")
        {
            return Err(invalid());
        }
        Ok(Self { index, scope_json, bitmap })
    }

    fn add(&mut self, name: &str, scope: &str, alias: &str, lane_hash: &str) -> io::Result<()> {
        if self.index.get("lanes").is_none_or(Value::is_null) {
            self.index["lanes"] = json!([]);
        }
        let lanes = self.index["lanes"].as_array_mut().ok_or_else(invalid)?;
        if lanes
            .iter()
            .any(|row| origin::id_scope_and_name(&row["id"]) == (scope, name))
        {
            return Err(invalid());
        }
        ensure_scope_lanes(&mut self.scope_json)?;
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

fn ensure_scope_lanes(scope_json: &mut Value) -> io::Result<()> {
    if scope_json.get("lanes").is_none_or(Value::is_null) {
        scope_json["lanes"] = json!({"current":"main","tracking":[],"new":[]});
    }
    let lanes_obj = scope_json["lanes"].as_object_mut().ok_or_else(invalid)?;
    if lanes_obj.get("tracking").is_none_or(Value::is_null) {
        lanes_obj.insert("tracking".into(), json!([]));
    }
    if lanes_obj.get("new").is_none_or(Value::is_null) {
        lanes_obj.insert("new".into(), json!([]));
    }
    Ok(())
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

fn history_components(components: &[Value]) -> io::Result<Vec<String>> {
    components
        .iter()
        .map(|entry| {
            let id = if let Some(raw_id) = entry["id"].as_str() {
                raw_id
                    .rsplit_once('@')
                    .map_or(raw_id, |(bare, _)| bare)
                    .to_owned()
            } else {
                let name = entry["id"]["name"].as_str().ok_or_else(invalid)?;
                match entry["id"]["scope"]
                    .as_str()
                    .filter(|val| !val.is_empty())
                {
                    Some(scope) => format!("{scope}/{name}"),
                    None => name.to_owned(),
                }
            };
            let head = entry["head"].as_str().ok_or_else(invalid)?;
            Ok(format!("{id}@{head}"))
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
