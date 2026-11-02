//! Removal reads source changes and effective configuration without loading environments.
//!
//! [`Reader`] queries [`Engine`] with [`Inventory`] and [`policy`] to prepare load-free component removal.
use super::preparation;
use crate::commands::{
    engine::Engine,
    inventory::{Inventory, Options},
    status::policy,
    workspace_command,
};
use serde_json::{Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

/// Load-free component status and configuration reader backed by [`Engine`] and [`policy`].
pub(super) struct Reader {
    engine: Engine,
    context: Value,
    files: Vec<(PathBuf, Vec<u8>)>,
}
impl Reader {
    /// Initializes a load-free [`Reader`] by requesting `statusContext` from [`Engine`].
    #[inline]
    pub(super) fn new(root: &Path) -> io::Result<Self> {
        let mut engine = Engine::new()?;
        let context = engine.request(&json!({"kind":"statusContext", "root":root, "home":workspace_command::home(), "history":false}))?;
        Ok(Self { engine, context, files: Vec::new() })
    }
    /// Returns the load-free package name and extension policy metadata for `identity`, if eligible.
    #[inline]
    pub(super) fn metadata(&self, identity: &str) -> Option<Value> {
        let target = self.target(identity)?;
        let policy = policy::status_policy(&self.context, target).ok()?;
        Some(
            json!({"identity": identity, "packageName": policy.package_name, "current": {"extensions":policy.extensions}}),
        )
    }
    /// Returns `Some(true)` if `identity` is modified, `Some(false)` if unmodified, or `None` if load-free status is inconclusive.
    #[inline]
    pub(super) fn status(&mut self, root: &Path, bitmap: &Value, identity: &str) -> Option<bool> {
        self.status_checked(root, bitmap, identity)
            .ok()
            .flatten()
    }
    /// Evaluates whether `identity` has local source or policy modifications relative to its stored version.
    fn status_checked(
        &mut self,
        root: &Path,
        bitmap: &Value,
        identity: &str,
    ) -> io::Result<Option<bool>> {
        let row = preparation::row(bitmap, identity)?;
        let Some(target) = self.target(identity).cloned() else { return Ok(None) };
        if !eligible(root, row) || pending(&self.context, identity) {
            return Ok(None);
        }
        let directory = row["rootDir"]
            .as_str()
            .map_or("", |dir| dir.trim().trim_start_matches("./"));
        let files = self.files(root, directory)?;
        let main = row["mainFile"]
            .as_str()
            .map_or("", |file| file.trim().trim_start_matches("./"));
        if !files.iter().any(|file| file == main) {
            return Ok(None);
        }
        self.compare(root, row, &target, identity, &files)
    }
    fn compare(
        &mut self,
        root: &Path,
        row: &Value,
        target: &Value,
        identity: &str,
        files: &[String],
    ) -> io::Result<Option<bool>> {
        let model = self.model(identity);
        let has_history = model.is_some_and(|model| self.has_history(identity, model));
        let version = row["version"].as_str().map_or("", str::trim);
        if version.is_empty() && !has_history {
            return Ok(Some(false));
        }
        let Some(model) = model.filter(|_| !version.is_empty()) else { return Ok(None) };
        if !has_history {
            return Ok(Some(false));
        }
        let reference = if matches!(version, "" | "latest" | "head") {
            model["head"].as_str().map_or(version, str::trim)
        } else {
            model["versions"][version]
                .as_str()
                .or_else(|| model["orphanedVersions"][version].as_str())
                .map_or(version, str::trim)
        };
        let Some(stored) = self.context["versions"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|entry| entry[0].as_str().map(str::trim) == Some(reference))
            .map(|entry| &entry[1])
        else {
            return Ok(None);
        };
        if stored["mainFile"] != target["mainFile"] {
            return Ok(Some(true));
        }
        let main = row["mainFile"].as_str().map_or("", str::trim);
        let directory = row["rootDir"].as_str().map_or("", str::trim);
        let current = json!({"mainFile":main,"dependencies":[],"devDependencies":[],"packageDependencies":{},"devPackageDependencies":{},"peerPackageDependencies":{},"bindingPrefix":"@bit","overrides":{},"extensions":[]});
        let result: Value = self.engine.request(&json!({"kind":"statusCompare", "root":root, "targets":[{"identity":identity,"version":version,"directory":directory,"files":files,"current":current}]}))?;
        Ok(result["comparisons"][0]["codeModified"].as_bool())
    }
    fn model(&self, identity: &str) -> Option<&Value> {
        let identity = identity.trim();
        self.context["models"]
            .as_array()?
            .iter()
            .find(|model| {
                format!(
                    "{}/{}",
                    model["scope"].as_str().map_or("", str::trim),
                    model["name"].as_str().map_or("", str::trim),
                ) == identity
            })
    }
    #[inline]
    fn has_history(&self, identity: &str, model: &Value) -> bool {
        self.context["laneHeads"][identity].is_string()
            || model["head"].is_string()
            || model["versions"]
                .as_object()
                .is_some_and(|versions| !versions.is_empty())
            || model["orphanedVersions"]
                .as_object()
                .is_some_and(|versions| !versions.is_empty())
    }
    #[inline]
    fn target(&self, identity: &str) -> Option<&Value> {
        let identity = identity.trim();
        self.context["targets"]
            .as_array()?
            .iter()
            .find(|target| target["identity"].as_str().map(str::trim) == Some(identity))
    }
    fn files(&mut self, root: &Path, directory: &str) -> io::Result<Vec<String>> {
        let options: Options =
            serde_json::from_value(self.context["options"].clone()).map_err(io::Error::other)?;
        let inventory = Inventory::new(&options)?;
        let comp_dir = root.join(directory);
        let manifest = inventory.scan(
            &mut self.engine,
            json!({"kind":"inventoryBegin","root":comp_dir,"workspace":root,"excludeDirs":[]}),
            "inventoryFinish",
        )?;
        let files = manifest["files"]
            .as_array()
            .ok_or_else(|| io::Error::other("removal source inventory"))?;
        let mut paths = Vec::with_capacity(files.len());
        self.files.reserve(files.len());
        for file in files {
            let relative = file["relativePath"]
                .as_str()
                .ok_or_else(|| io::Error::other("removal source path"))?;
            let path = comp_dir.join(relative);
            let bytes = fs::read(&path)?;
            self.files.push((path, bytes));
            paths.push(relative.to_owned());
        }
        Ok(paths)
    }
    pub(super) fn validate(&mut self) -> io::Result<()> {
        for (path, before) in &self.files {
            if fs::read(path)? != *before {
                return Err(io::Error::other("removal source changed before publication"));
            }
        }
        let result: Value = self.engine.request(
            &json!({"kind":"dependencyFreshValidate","readSet":self.context["controlReadSet"]}),
        )?;
        if result["fresh"] != true {
            return Err(io::Error::other("removal configuration changed before publication"));
        }
        Ok(())
    }
}
#[inline]
fn eligible(root: &Path, row: &Value) -> bool {
    let Some(directory) = row["rootDir"]
        .as_str()
        .map(str::trim)
        .filter(|directory| !directory.is_empty() && *directory != ".")
    else {
        return false;
    };
    if !row["config"].as_object().is_none_or(serde_json::Map::is_empty) {
        return false;
    }
    let comp_dir = root.join(directory);
    comp_dir.is_dir() && !comp_dir.join("component.json").exists()
}
fn pending(context: &Value, identity: &str) -> bool {
    let identity = identity.trim();
    context["unmerged"]
        .as_array()
        .into_iter()
        .flatten()
        .any(|entry| {
            entry["id"]
                .as_str()
                .map(|raw| {
                    raw.trim()
                        .split('@')
                        .next()
                        .unwrap_or(raw)
                        .trim()
                })
                == Some(identity)
                || format!(
                    "{}/{}",
                    entry["id"]["scope"].as_str().map_or("", str::trim),
                    entry["id"]["name"].as_str().map_or("", str::trim),
                ) == identity
        })
}
