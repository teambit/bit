use super::{
    BitmapState, Heads, ObjectChange, Repository, Selection, changed, indexed_hash, invalid,
    membership, proofs, remote, unique_position,
};
use serde_json::Value;
use std::{
    io,
    path::{Path, PathBuf},
};

struct Loaded {
    objects: PathBuf,
    lane_hash: String,
    model: Value,
    lane: Value,
}

impl Repository {
    pub(super) fn load(
        root: &Path,
        bitmap: &BitmapState,
        scope: &str,
        name: &str,
    ) -> io::Result<Self> {
        Self::load_inner(root, bitmap, scope, name, true)
    }

    pub(super) fn staged(
        root: &Path,
        bitmap: &BitmapState,
        scope: &str,
        name: &str,
    ) -> io::Result<Self> {
        Self::load_inner(root, bitmap, scope, name, false)
    }

    fn load_inner(
        root: &Path,
        bitmap: &BitmapState,
        scope: &str,
        name: &str,
        require_bitmap: bool,
    ) -> io::Result<Self> {
        let mut reads = vec![(root.join(".bitmap"), Some(bitmap.before.clone()))];
        let Loaded { objects, lane_hash, model, lane } =
            load_objects(root, bitmap, scope, name, &mut reads)?;
        let current = current(&lane, bitmap, scope, name, require_bitmap)?;
        let remote_head = remote::exported_head(root, bitmap, scope, name, &mut reads)?;
        let baseline = remote::baseline(
            root,
            bitmap,
            &lane,
            &model,
            (scope, name),
            remote_head.as_deref(),
            &mut reads,
        )?;
        proofs::read(
            &super::object_path(
                &objects,
                &super::object_hash(&format!("{scope}/{name}:VersionHistory")),
            ),
            &mut reads,
        )?;
        proofs::verify(&reads)?;
        Ok(Self {
            objects,
            lane_scope: bitmap.lane_scope.clone(),
            lane_name: bitmap.lane_name.clone(),
            lane_hash,
            lane,
            heads: Heads { current, remote: remote_head, baseline },
            model,
            reads,
        })
    }

    pub(super) fn project_lane(&mut self, selection: &Selection) -> io::Result<()> {
        let scope = self.model["scope"]
            .as_str()
            .map(str::trim)
            .filter(|scope| !scope.is_empty())
            .ok_or_else(|| invalid("lane reset model scope"))?
            .to_owned();
        let name = self.model["name"]
            .as_str()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .ok_or_else(|| invalid("lane reset model name"))?
            .to_owned();
        membership::project(&mut self.lane, &scope, &name, selection)
    }

    pub(super) fn lane_object(&self) -> io::Result<ObjectChange> {
        changed(&self.objects, &self.lane_hash, "Lane", &self.lane)
    }
}

fn load_objects(
    root: &Path,
    bitmap: &BitmapState,
    scope: &str,
    name: &str,
    reads: &mut proofs::ReadSet,
) -> io::Result<Loaded> {
    let bytes = proofs::read(&crate::scope_path(root).join("index.json"), reads)?
        .ok_or_else(|| invalid("lane reset scope index absent"))?;
    let index: Value = crate::parse_jsonc(&bytes)?;
    let lane_hash = indexed_hash(&index, "lanes", &bitmap.lane_scope, &bitmap.lane_name)?;
    let model_hash = indexed_hash(&index, "components", scope, name)?;
    let objects = crate::scope_path(root).join("objects");
    let model = proofs::object(&objects, &model_hash, "Component", reads)?;
    if model["scope"].as_str().map(str::trim) != Some(scope)
        || model["name"].as_str().map(str::trim) != Some(name)
    {
        return Err(invalid("lane reset Component identity"));
    }
    let lane = proofs::object(&objects, &lane_hash, "Lane", reads)?;
    if lane["scope"].as_str().map(str::trim) != Some(bitmap.lane_scope.as_str())
        || lane["name"].as_str().map(str::trim) != Some(bitmap.lane_name.as_str())
    {
        return Err(invalid("lane reset Lane identity"));
    }
    Ok(Loaded { objects, lane_hash, model, lane })
}

fn current(
    lane: &Value,
    bitmap: &BitmapState,
    scope: &str,
    name: &str,
    require_bitmap: bool,
) -> io::Result<String> {
    let rows =
        lane["components"].as_array().ok_or_else(|| invalid("lane reset Lane components"))?;
    let visible = rows
        .iter()
        .any(|row| {
            let (row_scope, row_name) = super::row_id_parts(&row["id"]);
            (row_scope == scope || row_scope.is_empty()) && row_name == name
        });
    let current = if visible {
        if require_bitmap && bitmap.key.is_empty() {
            return Err(invalid("lane reset visible bitmap absent"));
        }
        rows[unique_position(rows, scope, name)?]["head"]
            .as_str()
            .map(str::trim)
            .filter(|head| !head.is_empty())
            .ok_or_else(|| invalid("lane reset head"))?
            .to_owned()
    } else {
        membership::hidden_head(lane, &format!("{scope}/{name}"))?
            .ok_or_else(|| invalid("lane reset membership absent"))?
    };
    crate::merge_history::hash(&current)?;
    Ok(current)
}
