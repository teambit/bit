use super::{Value, invalid, json};
use crate::commands::{
    engine::Engine,
    remote_action::startup,
    status::{capture, environments::Environments},
};
use bit_install::{config::WorkspaceConfig, workspace::Workspace};
use std::{env, fs, io, path::Path};

pub(super) struct Loaded {
    engine: Engine,
    context: Value,
    capture: capture::Capture,
    ids: Vec<Value>,
    pub(super) progress: super::progress::Progress,
    pub(super) files: Vec<Value>,
    counts: Vec<usize>,
    docs: Vec<crate::commands::add::docs::CatDocs>,
}
impl Loaded {
    pub(super) fn prepare(root: &Path, options: &super::Options) -> io::Result<Self> {
        let (workspace, name) = workspace(root)?;
        let home =
            env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap_or_default();
        let mut engine = Engine::new()?;
        let context: Value = engine.request(
            &json!({"kind":"statusContext","root":root,"home":Path::new(&home),"history":options.changed && options.pattern.is_none()}),
        )?;
        let targets = selected(root, &context, options)?;
        let mut capture = capture::capture_with(
            &mut engine,
            root,
            Path::new(&home),
            &context,
            &targets,
            capture::CaptureOptions::default(),
        )?;
        order_sources(root, &mut capture)?;
        let load_count = targets.len();
        let docs = super::docs::prepare(root, &capture.captured)?;
        let targets = changed(&mut engine, root, &capture, targets, options)?;
        let mut loaded = Self {
            engine,
            context,
            capture,
            ids: Vec::new(),
            progress: super::progress::Progress {
                name,
                identities: Vec::new(),
                loads: if options.changed && options.pattern.is_none() {
                    vec![load_count, targets.len()]
                } else {
                    vec![targets.len()]
                },
            },
            files: Vec::new(),
            counts: Vec::new(),
            docs,
        };
        loaded.add_selected(root, &workspace, &targets, options)?;
        Ok(loaded)
    }
    fn add_selected(
        &mut self,
        root: &Path,
        workspace: &Workspace,
        targets: &[Value],
        options: &super::Options,
    ) -> io::Result<()> {
        for (entry, _) in workspace.active() {
            if targets
                .iter()
                .any(|target| target["identity"] == entry.id.to_string_without_version())
            {
                self.add(root, entry)?;
            }
        }
        if !options.check
            && (self.counts.len() > 1
                || self.counts
                    .iter()
                    .any(|count| *count > 1))
        {
            return Err(invalid("formatter concurrent source writes"));
        }
        Ok(())
    }
    fn add(&mut self, root: &Path, entry: &bit_install::workspace::BitmapEntry) -> io::Result<()> {
        let identity = entry.id.to_string_without_version();
        let row = self.capture.captured
            .iter()
            .find(|row| row["identity"] == identity)
            .ok_or_else(|| invalid("formatter capture"))?;
        let files = row["files"].as_array().ok_or_else(|| invalid("formatter files"))?;
        self.counts.push(files.len());
        for file in files {
            let relative = file.as_str().ok_or_else(|| invalid("formatter filename"))?;
            let path = root.join(&entry.root_dir).join(relative);
            let source = fs::read_to_string(&path)?;
            self.files.push(json!({"filePath":relative,"absolutePath":path,"source":source}));
        }
        let mut legacy = json!({"scope":entry.id.scope,"name":entry.id.name});
        legacy["version"] = json!(entry.id.version.as_deref().unwrap_or("latest"));
        let mut id = json!({"_legacy":legacy});
        id["_scope"] = json!(
            entry.id.scope
                .as_ref()
                .or(entry.id.default_scope.as_ref())
                .ok_or_else(|| invalid("formatter component scope"))?
        );
        self.ids.push(id);
        self.progress.identities.push(
            entry.id.version
                .as_ref()
                .map_or_else(|| identity.clone(), |version| format!("{identity}@{version}")),
        );
        Ok(())
    }
    pub(super) fn result(&self, files: &[Value]) -> io::Result<Value> {
        if files.len() != self.files.len() {
            return Err(invalid("formatter file count"));
        }
        let mut offset = 0;
        let results: Vec<_> = self.ids
            .iter()
            .zip(&self.counts)
            .map(|(id, count)| {
                let rows = &files[offset..offset + count];
                offset += count;
                json!({"componentId":id,"results":rows})
            })
            .collect();
        Ok(json!({"results":results,"errors":[]}))
    }
    pub(super) fn commit(&mut self, root: &Path) -> io::Result<()> {
        for plan in self.docs.drain(..) {
            plan.publish()?;
        }
        capture::commit(&mut self.engine, root, &self.context, &self.capture)
    }
}

fn workspace(root: &Path) -> io::Result<(Workspace, String)> {
    let raw: Value = bit_object_import::parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    if !startup::supported(Some(root), &crate::workspace::scope_path(root), &raw, true)? {
        return Err(invalid("formatter startup callbacks"));
    }
    let config = WorkspaceConfig::load(root).map_err(io::Error::other)?;
    let core: Vec<String> = serde_json::from_str(include_str!(
        "../../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))?;
    let workspace = Workspace::load(root, &config, &core).map_err(io::Error::other)?;
    for (_, component) in workspace.active() {
        if !matches!(component.env_id.as_str(), "teambit.harmony/node" | "teambit.react/react")
            || component.is_env
        {
            return Err(invalid("formatter environment service"));
        }
    }
    let name = config.workspace.name
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| {
            root.file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned()
        });
    Ok((workspace, name))
}
fn changed(
    engine: &mut Engine,
    root: &Path,
    capture: &capture::Capture,
    targets: Vec<Value>,
    options: &super::Options,
) -> io::Result<Vec<Value>> {
    if !options.changed || options.pattern.is_some() {
        return Ok(targets);
    }
    let compared: Value =
        engine.request(&json!({"kind":"statusCompare","root":root,"targets":capture.comparisons}))?;
    let rows = compared["comparisons"].as_array().ok_or_else(|| invalid("formatter comparison"))?;
    Ok(targets
        .into_iter()
        .filter(|target| {
            target["version"].as_str().is_none()
                || rows
                    .iter()
                    .any(|row| row["identity"] == target["identity"] && row["modified"] == true)
        })
        .collect())
}

fn serial_loading(root: &Path, targets: &[Value], options: &super::Options) -> io::Result<()> {
    use bit_install::dependencies::cache::invalidation::{deps_dir, needs_invalidation};
    if options.check && options.json && targets.len() == 2 {
        return Ok(());
    }
    let cache = deps_dir(root);
    if targets.len() > 1 && cache.join("index-v5").exists() && !needs_invalidation(root, &cache)? {
        return Err(invalid("formatter parallel cached component order"));
    }
    Ok(())
}

fn selected(root: &Path, context: &Value, options: &super::Options) -> io::Result<Vec<Value>> {
    let targets = context["targets"].as_array().ok_or_else(|| invalid("formatter targets"))?;
    Environments::require_native_write_for(root, context, targets)?;
    if options.pattern.as_deref().is_some_and(crate::commands::diff::selection::stateful) {
        return Err(invalid("formatter stateful selection"));
    }
    let targets = crate::commands::diff::selection::select(targets, options.pattern.as_deref())?;
    serial_loading(root, &targets, options)?;
    Ok(targets)
}

fn order_sources(root: &Path, capture: &mut capture::Capture) -> io::Result<()> {
    for component in &mut capture.captured {
        let files: Vec<String> = serde_json::from_value(component["files"].clone())?;
        let directory =
            component["directory"].as_str().ok_or_else(|| invalid("formatter source directory"))?;
        component["files"] = json!(crate::commands::diff::order::captured(
            &root.join(directory),
            &files,
            component.get("sourceOverlays")
        )?);
    }
    Ok(())
}
