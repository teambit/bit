//! Removal reads source changes and effective configuration without loading environments.
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

pub(super) struct Reader {
    engine: Engine,
    context: Value,
    files: Vec<(PathBuf, Vec<u8>)>,
}
impl Reader {
    pub(super) fn new(root: &Path) -> io::Result<Self> {
        let mut engine = Engine::new()?;
        let context = engine.request(&json!({"kind":"statusContext", "root":root, "home":workspace_command::home(), "history":false}))?;
        Ok(Self { engine, context, files: Vec::new() })
    }
    pub(super) fn metadata(&self, identity: &str) -> Option<Value> {
        let target = self.target(identity)?;
        let policy = policy::status_policy(&self.context, target).ok()?;
        Some(
            json!({"identity": identity, "packageName": policy.package_name, "current": {"extensions":policy.extensions}}),
        )
    }
    pub(super) fn status(&mut self, root: &Path, bitmap: &Value, identity: &str) -> Option<bool> {
        self.status_checked(root, bitmap, identity)
            .ok()
            .flatten()
    }
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
        let directory = row["rootDir"].as_str().unwrap_or_default();
        let files = self.files(root, directory)?;
        let main = row["mainFile"].as_str().unwrap_or_default();
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
        let version = row["version"].as_str().unwrap_or_default();
        if version.is_empty() && !has_history {
            return Ok(Some(false));
        }
        let Some(model) = model.filter(|_| !version.is_empty()) else { return Ok(None) };
        if !has_history {
            return Ok(Some(false));
        }
        let reference = if version.is_empty() || version == "latest" {
            model["head"].as_str().unwrap_or(version)
        } else {
            model["versions"][version]
                .as_str()
                .or_else(|| model["orphanedVersions"][version].as_str())
                .unwrap_or(version)
        };
        let Some(stored) = self.context["versions"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|entry| entry[0] == reference)
            .map(|entry| &entry[1])
        else {
            return Ok(None);
        };
        if stored["mainFile"] != target["mainFile"] {
            return Ok(Some(true));
        }
        let main = row["mainFile"].as_str().unwrap_or_default();
        let directory = row["rootDir"].as_str().unwrap_or_default();
        let current = json!({"mainFile":main,"dependencies":[],"devDependencies":[],"packageDependencies":{},"devPackageDependencies":{},"peerPackageDependencies":{},"bindingPrefix":"@bit","overrides":{},"extensions":[]});
        let result: Value = self.engine.request(&json!({"kind":"statusCompare", "root":root, "targets":[{"identity":identity,"version":version,"directory":directory,"files":files,"current":current}]}))?;
        Ok(result["comparisons"][0]["codeModified"].as_bool())
    }
    fn model(&self, identity: &str) -> Option<&Value> {
        self.context["models"]
            .as_array()?
            .iter()
            .find(|model| {
                format!(
                    "{}/{}",
                    model["scope"].as_str().unwrap_or_default(),
                    model["name"].as_str().unwrap_or_default(),
                ) == identity
            })
    }
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
    fn target(&self, identity: &str) -> Option<&Value> {
        self.context["targets"]
            .as_array()?
            .iter()
            .find(|target| target["identity"] == identity)
    }
    fn files(&mut self, root: &Path, directory: &str) -> io::Result<Vec<String>> {
        let options: Options =
            serde_json::from_value(self.context["options"].clone()).map_err(io::Error::other)?;
        let inventory = Inventory::new(&options)?;
        let manifest = inventory.scan(&mut self.engine, json!({"kind":"inventoryBegin","root":root.join(directory),"workspace":root,"excludeDirs":[]}), "inventoryFinish")?;
        let files = manifest["files"]
            .as_array()
            .ok_or_else(|| io::Error::other("removal source inventory"))?;
        let mut paths = Vec::new();
        for file in files {
            let relative = file["relativePath"]
                .as_str()
                .ok_or_else(|| io::Error::other("removal source path"))?;
            let path = root.join(directory).join(relative);
            self.files.push((path.clone(), fs::read(path)?));
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
fn eligible(root: &Path, row: &Value) -> bool {
    let Some(directory) = row["rootDir"]
        .as_str()
        .filter(|directory| *directory != ".")
    else {
        return false;
    };
    row["config"].as_object().is_none_or(serde_json::Map::is_empty)
        && root.join(directory).is_dir()
        && !root
            .join(directory)
            .join("component.json")
            .exists()
}
fn pending(context: &Value, identity: &str) -> bool {
    context["unmerged"]
        .as_array()
        .into_iter()
        .flatten()
        .any(|entry| {
            format!(
                "{}/{}",
                entry["id"]["scope"].as_str().unwrap_or_default(),
                entry["id"]["name"].as_str().unwrap_or_default(),
            ) == identity
        })
}
