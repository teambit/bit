mod paths;
mod reload;
mod unrelated;
use super::{
    super::{capture::Captured, input::Options},
    State, invalid,
};
use crate::workspace::engine::status_models::harmony;
use paths::validate as validate_path;
use serde_json::{Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub(in crate::workspace::engine::command) struct VersionSide<'a> {
    pub(in crate::workspace::engine::command) hash: &'a str,
    pub(in crate::workspace::engine::command) value: &'a Value,
}
pub(in crate::workspace::engine::command) struct BodyInput<'a> {
    pub(in crate::workspace::engine::command) root: &'a Path,
    pub(in crate::workspace::engine::command) directory: &'a Path,
    pub(in crate::workspace::engine::command) index: usize,
    pub(in crate::workspace::engine::command) current: &'a Captured,
    pub(in crate::workspace::engine::command) sides: [VersionSide<'a>; 3], // base, current, incoming
    pub(in crate::workspace::engine::command) lane: Option<&'a Value>,
    pub(in crate::workspace::engine::command) overlay: Option<&'a crate::command_import::Overlay>,
    pub(in crate::workspace::engine::command) options: &'a Options,
}
pub(in crate::workspace::engine::command) struct Prepared {
    conflict: Conflict,
    pub(in crate::workspace::engine::command) hidden: bool,
    pub(in crate::workspace::engine::command) output: Value,
    pub(in crate::workspace::engine::command) version: Value,
    pub(in crate::workspace::engine::command) version_name: String,
    pub(in crate::workspace::engine::command) files: Vec<Value>,
    pub(in crate::workspace::engine::command) conflict_paths: Vec<String>,
    destinations: Destinations,
}

struct Destinations {
    request: Value,
    removals: Vec<PathBuf>,
}

enum Conflict {
    Resolved,
    Ours,
    Manual,
    Unrelated(Value),
}
impl Conflict {
    fn from_plan(input: &BodyInput<'_>, plan: &Value) -> Self {
        if plan["hasConflicts"] != true {
            return Self::Resolved;
        }
        match input.options.strategy.as_deref() {
            Some("ours") => Self::Ours,
            Some("manual") => Self::Manual,
            _ => Self::Resolved,
        }
    }
}

impl BodyInput<'_> {
    pub(in crate::workspace::engine::command) fn labels(&self) -> io::Result<Value> {
        let name = |lane: &Value, field: &str| -> io::Result<String> {
            if lane[field].is_null() {
                return Ok("main".into());
            }
            let value = &lane[field]["value"];
            let scope = value["scope"].as_str().ok_or_else(|| invalid("merge label lane scope"))?;
            let name = value["name"].as_str().ok_or_else(|| invalid("merge label lane name"))?;
            Ok(format!("{scope}/{name}"))
        };
        let (current, incoming) = if let Some(lane) = self.lane {
            (name(lane, "current")?, name(lane, "other")?)
        } else {
            ("main".into(), "main".into())
        };
        let same = current == incoming;
        Ok(
            json!({"current":format!("{} ({})",self.current.target.version,if same {"current"} else {&current}),
            "other":format!("{} ({})",self.sides[2].hash,if same {"incoming"} else {&incoming})}),
        )
    }

    fn metadata_guard(&self) -> io::Result<()> {
        let projected = self.sides
            .iter()
            .map(|side| harmony::project(side.value))
            .collect::<io::Result<Vec<_>>>()?;
        let no_snap = self.options.no_snap
            || self.options.lane.as_ref().is_some_and(|lane| lane.no_auto_snap);
        if !no_snap && projected.iter().any(has_remove_extension) {
            return Err(invalid("command unsupported non-policy metadata change"));
        }
        metadata_guard(&projected)
    }

    pub(in crate::workspace::engine::command) fn request(&self) -> io::Result<Value> {
        self.metadata_guard()?;
        let current =
            self.current.files.as_array().ok_or_else(|| invalid("command merge current files"))?;
        Ok(
            json!({"index":self.index,"objectsDirectory":crate::scope_path(self.root).join("objects"),"snapshotDirectory":self.directory,
                "base":manifest(&self.sides[0])?,"target":manifest(&self.sides[2])?,
                "current":current.iter().map(|file| json!({"relativePath":file["relativePath"],"workspace":{
                    "path":file["path"],"rawHash":file["rawHash"],"snapshotHash":file["snapshotHash"],"readToken":file["readToken"]}})).collect::<Vec<_>>(),
                "labels":self.labels()?,
            }),
        )
    }
}

impl State {
    pub(in crate::workspace::engine::command) fn prepare_result(
        &mut self,
        input: &BodyInput<'_>,
        plan: &Value,
    ) -> io::Result<Prepared> {
        if plan["hasConflicts"] == true && input.options.strategy.is_none() {
            return Err(invalid("command merge requires conflict prompt"));
        }
        let target = if input.options.strategy.as_deref() == Some("theirs") {
            &input.sides[2]
        } else {
            &input.sides[1]
        };
        let applied = self.apply(json!({"planToken":plan["token"],"target":manifest(target)?,"strategy":input.options.strategy}), input.overlay)?;
        if applied.get("deferredError").is_some() {
            return Err(invalid("command merge deferred apply failure"));
        }
        let removals = crate::merge_transaction::apply(
            "mergeRemovals",
            json!({"token":self.owner(),"planToken":plan["token"],
            "filesStatus":applied["filesStatus"],"tracked":true,"workspaceRoot":false}),
            &mut self.native,
        )?;
        Prepared::new(input, plan, &applied, &removals)
    }
}

impl Prepared {
    pub(in crate::workspace::engine::command) fn no_write(&self) -> bool {
        matches!(self.conflict, Conflict::Ours | Conflict::Unrelated(_))
    }
    pub(in crate::workspace::engine::command) fn has_conflicts(&self) -> bool {
        matches!(self.conflict, Conflict::Manual)
    }

    fn new(
        input: &BodyInput<'_>,
        plan: &Value,
        applied: &Value,
        removals: &Value,
    ) -> io::Result<Self> {
        let files = output_files(applied)?;
        let statuses = file_statuses(removals)?;
        let destinations = files.iter().map(|file| json!({"planIndex":file["planIndex"],
            "path":input.root.join(&input.current.target.directory).join(file["relativePath"].as_str().unwrap_or_default()),"overwrite":true,"eol":"auto"})).collect::<Vec<_>>();
        let removals = removals["removals"]
            .as_array()
            .ok_or_else(|| invalid("command merge removals"))?
            .iter()
            .map(|value| {
                value
                    .as_str()
                    .map(PathBuf::from)
                    .ok_or_else(|| invalid("command merge removal path"))
            })
            .collect::<io::Result<Vec<_>>>()?;
        let files = reload::files(input, plan, files, &removals)?;
        Ok(Self {
            conflict: Conflict::from_plan(input, plan),
            hidden: input.current.hidden,
            output: json!({"id":format!("{}@{}",input.current.target.identity,input.current.target.version),"filesStatus":statuses}),
            version: current_version(input)?,
            version_name: input.current.target.version.clone(),
            files,
            conflict_paths: conflict_paths(input, plan)?,
            destinations: Destinations {
                request: json!({"planToken":plan["token"],"files":destinations}),
                removals,
            },
        })
    }
    pub(in crate::workspace::engine::command) fn validate(&self, root: &Path) -> io::Result<()> {
        if self.hidden {
            return Ok(());
        }
        for row in self.destinations.request["files"]
            .as_array()
            .ok_or_else(|| invalid("merge destination files"))?
        {
            validate_path(
                root,
                Path::new(row["path"].as_str().ok_or_else(|| invalid("merge destination path"))?),
            )?;
        }
        for path in &self.destinations.removals {
            validate_path(root, path)?;
        }
        Ok(())
    }
    pub(in crate::workspace::engine::command) fn remove(&self) -> io::Result<()> {
        if self.hidden || self.no_write() {
            return Ok(());
        }
        for path in &self.destinations.removals {
            match fs::remove_file(path) {
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                Err(error) => return Err(error),
            }
        }
        Ok(())
    }
    pub(in crate::workspace::engine::command) fn write(&self, state: &mut State) -> io::Result<()> {
        if self.hidden || self.no_write() {
            return Ok(());
        }
        state.materialize(self.destinations.request.clone())
    }
}

fn output_files(applied: &Value) -> io::Result<Vec<Value>> {
    let bodies =
        applied["bodies"].as_array().ok_or_else(|| invalid("command merge body manifest"))?;
    let files =
        applied["files"].as_array().ok_or_else(|| invalid("command merge applied files"))?;
    if files.is_empty() {
        return Err(invalid("command merged component has no files"));
    }
    files
        .iter()
        .map(|file| {
            let path = file["relativePath"]
                .as_str()
                .ok_or_else(|| invalid("command merge output path"))?;
            crate::checkout::plan::relative_path(path)?;
            if path == ".bitmap" {
                return Err(invalid("command nested bitmap merge"));
            }
            let body = bodies
                .iter()
                .find(|body| body["planIndex"] == file["planIndex"])
                .ok_or_else(|| invalid("command merge retained body"))?;
            Ok(json!({"relativePath":path,"planIndex":file["planIndex"],"source":body}))
        })
        .collect()
}
fn manifest(side: &VersionSide<'_>) -> io::Result<Value> {
    let files =
        side.value["files"].as_array().ok_or_else(|| invalid("command merge Version files"))?;
    let files = files
        .iter()
        .map(|file| {
            let mut row = json!({"hash":file["file"],"relativePath":file["relativePath"]});
            for field in ["name", "test"] {
                if let Some(value) = file.get(field) {
                    row[field] = value.clone();
                }
            }
            row
        })
        .collect::<Vec<_>>();
    Ok(json!({"hash":side.hash,"files":files}))
}

fn conflict_paths(input: &BodyInput<'_>, plan: &Value) -> io::Result<Vec<String>> {
    if input.options.strategy.as_deref() != Some("manual") {
        return Ok(Vec::new());
    }
    plan["mergeRows"]
        .as_array()
        .ok_or_else(|| invalid("merge retained rows"))?
        .iter()
        .filter(|row| row["kind"] == "modifiedFiles" && row.get("conflictPlanIndex").is_some())
        .map(|row| {
            let index =
                row["current"].as_u64().ok_or_else(|| invalid("merge conflict file index"))?
                    as usize;
            input.current.files[index]["relativePath"]
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| invalid("merge conflict path"))
        })
        .collect()
}

pub(in crate::workspace::engine::command) fn equivalent_dependencies(
    value: &Value,
    current: &Value,
) -> io::Result<()> {
    let mut normalized = value.clone();
    let rows = normalized.as_array_mut().ok_or_else(|| invalid("merge dependency metadata"))?;
    let reference =
        current.as_array().ok_or_else(|| invalid("merge current dependency metadata"))?;
    if rows.len() != reference.len() {
        return Err(invalid("merge dependency metadata count"));
    }
    for (row, expected) in rows.iter_mut().zip(reference) {
        if row.get("packageName").is_none()
            && let Some(name) = expected.get("packageName")
        {
            row["packageName"] = name.clone();
        }
    }
    if normalized != *current {
        return Err(invalid("merge dependency metadata differs"));
    }
    Ok(())
}

fn current_version(input: &BodyInput<'_>) -> io::Result<Value> {
    let mut version = harmony::project(input.sides[1].value)?;
    for field in [
        "mainFile",
        "dependencies",
        "devDependencies",
        "packageDependencies",
        "devPackageDependencies",
        "peerPackageDependencies",
        "bindingPrefix",
        "overrides",
    ] {
        version[field] = input.current.target.current[field].clone();
    }
    Ok(version)
}

pub(super) fn metadata_guard(projected: &[Value]) -> io::Result<()> {
    for field in ["mainFile", "bindingPrefix", "docs", "packageJsonChangedProps"] {
        if projected
            .iter()
            .any(|side| side[field] != projected[1][field])
        {
            return Err(invalid("command unsupported non-policy metadata change"));
        }
    }
    Ok(())
}

fn has_remove_extension(version: &Value) -> bool {
    version["extensions"]
        .as_array()
        .is_some_and(|rows| {
            rows.iter()
                .any(|row| {
                    row["name"]
                        .as_str()
                        .or_else(|| row["extensionId"].as_str())
                        .is_some_and(|id| id.split('@').next() == Some("teambit.component/remove"))
                })
        })
}

fn file_statuses(removals: &Value) -> io::Result<serde_json::Map<String, Value>> {
    removals["filesStatus"]
        .as_array()
        .ok_or_else(|| invalid("command merge statuses"))?
        .iter()
        .map(|row| {
            Ok((
                row["relativePath"]
                    .as_str()
                    .ok_or_else(|| invalid("command merge status path"))?
                    .to_owned(),
                row["status"].clone(),
            ))
        })
        .collect::<io::Result<serde_json::Map<_, _>>>()
}
