//! Stash captures provider facts without the snap build or publication lifecycle.
use super::{home, resolve, snapshot::receipt};
use crate::commands::{
    engine::Engine,
    status::{
        autosync::Startup,
        capture::{self, Capture, CaptureOptions},
        environments,
        js::{array, decline, text},
    },
};
use serde_json::{Value, json};
use std::{io, path::Path};

/// Detached objects and metadata remain retained until command execution starts.
pub(in crate::commands) struct Save {
    engine: Engine,
    token: String,
    capture: Capture,
    context: Value,
    removal: Vec<Value>,
    pub loaded: usize,
    pub modified: Vec<String>,
    pub new: Vec<String>,
}

impl Save {
    /// Load providers, observe native sources, and stage detached Versions.
    pub fn prepare(
        root: &Path,
        include_new: bool,
        message: Option<&str>,
        startup: &mut Startup,
    ) -> io::Result<Self> {
        let mut session = Captured::new(root, startup)?;
        let histories = session.history(true)?;
        let (plan, removal) = session.plan(include_new)?;
        startup.committed |= histories > 0;
        session.history(false)?;
        startup.build_progress.as_mut().ok_or_else(|| decline("stash progress absent"))?["stash"]
            ["importing"] = json!(!array(plan.get("needsStash"), "stash selections")?.is_empty());
        finalize(root, &mut session.engine, &session.token, &plan, message, startup)?;
        let loaded = array(session.context.get("targets"), "stash targets")?.len();
        Ok(Self {
            engine: session.engine,
            token: session.token,
            context: session.context,
            capture: session.capture,
            removal,
            loaded,
            modified: identities(&plan["modifiedIds"])?,
            new: identities(&plan["newIds"])?,
        })
    }

    /// Effective post-load aspect facts used by removeLocallyByIds' safety scan.
    pub fn removal_components(&self) -> Vec<Value> {
        self.removal.clone()
    }

    /// Reuse the same providers for reset after persisting the stash.
    pub fn take_environment(&mut self) -> Option<environments::Environments> {
        capture::take_callback_environment(&mut self.capture)
    }

    /// Persist Sources and detached Versions before the stash metadata file.
    pub fn persist(&mut self, root: &Path) -> io::Result<()> {
        if self.modified.is_empty() && self.new.is_empty() {
            return Ok(());
        }
        let persisted: Value =
            self.engine.request(&json!({"kind":"commandStashPersist","token":self.token}))?;
        check(&persisted, &self.token)?;
        capture::commit(&mut self.engine, root, &self.context, &self.capture)
    }
}

fn identities(value: &Value) -> io::Result<Vec<String>> {
    array(Some(value), "stash identities")?
        .iter()
        .map(|id| text(Some(id)).map(|raw| raw.trim().to_owned()))
        .collect()
}

fn check(value: &Value, token: &str) -> io::Result<()> {
    if value["token"].as_str().map(str::trim) == Some(token.trim()) {
        Ok(())
    } else {
        Err(decline("stash receipt token"))
    }
}

impl super::Planned {
    /// Retain the same provider session across new-component callbacks and tracked checkout.
    pub(in crate::commands) fn stash_added(
        &mut self,
        root: &Path,
    ) -> io::Result<Option<environments::Environments>> {
        use std::io::Write;
        let ids = identities(&self.plan["stashAdded"])?;
        let mut environment =
            self.take_environment().unwrap_or_else(environments::Environments::for_stash_callbacks);
        io::stdout().write_all(environment.stash_added(root, &ids)?.as_bytes())?;
        Ok(Some(environment))
    }
}

struct Captured {
    engine: Engine,
    token: String,
    context: Value,
    capture: Capture,
}
impl Captured {
    fn history(&mut self, prepare_only: bool) -> io::Result<u64> {
        let result: Value = self.engine.request(&json!({
            "kind":"commandStashStageHistory","token":self.token,"prepareOnly":prepare_only,
        }))?;
        check(&result, &self.token)?;
        result["written"].as_u64().ok_or_else(|| decline("stash history count"))
    }

    fn new(root: &Path, startup: &mut Startup) -> io::Result<Self> {
        let mut engine = Engine::new()?;
        let home = home();
        let (_, environments) =
            environments::read_snapshot_context(&mut engine, root, &home, false, startup)?;
        let prepared:Value=engine.request(&json!({"kind":"commandStashPrepare","root":root,"home":home,"globalRemotesFile":crate::commands::status::cache::cache_root().join("config/global-remotes.json")}))?;
        let token = text(prepared.get("token"))?.to_owned();
        let context = prepared["context"].clone();
        let targets = array(context.get("targets"), "stash targets")?;
        startup.build_progress = Some(json!({"stash":{"loaded":targets.len(),"importing":false}}));
        let capture = capture::capture_with(
            &mut engine,
            root,
            &home,
            &context,
            targets,
            CaptureOptions {
                environments: Some(environments),
                verify: true,
                allow_special_states: true,
                ..CaptureOptions::default()
            },
        )?;
        super::checkout_lifecycle::retain(Some(startup), &capture);
        Ok(Self { engine, token, context, capture })
    }

    fn plan(&mut self, include_new: bool) -> io::Result<(Value, Vec<Value>)> {
        let components = resolve::component_receipts(&self.context, &self.capture)?;
        let removal = self.capture.captured
            .iter()
            .map(|row| {
                let row_id = row["identity"].as_str().or_else(|| row["id"].as_str());
                let component = components.iter().find(|component| {
                    component["identity"]
                        .as_str()
                        .or_else(|| component["id"].as_str())
                        == row_id
                });
                json!({"identity":row_id,"extensions":row["current"]["extensions"],"packageName":component.map(|component|&component["packageName"])})
            })
            .collect();
        let metadata = self.capture.captured
            .iter()
            .filter_map(|row| {
                let id = row["identity"]
                    .as_str()
                    .or_else(|| row["id"].as_str())?;
                let data = capture::snapshot_data(&self.capture, id)?;
                Some((id.to_owned(), data["consumerMetadata"].clone()))
            })
            .collect::<serde_json::Map<String, Value>>();
        let plan: Value =
            self.engine.request(&json!({"kind":"commandStashPlan","token":self.token,
            "current":self.capture.captured,"consumerMetadata":metadata,"components":components,
            "dependencyReadSet":self.capture.dependency_read_set(),"includeNew":include_new}))?;
        check(&plan, &self.token)?;
        Ok((plan, removal))
    }
}

fn finalize(
    root: &Path,
    engine: &mut Engine,
    token: &str,
    plan: &Value,
    message: Option<&str>,
    startup: &mut Startup,
) -> io::Result<()> {
    let selected = identities(&plan["needsStash"])?;
    if selected.is_empty() {
        return Ok(());
    }
    let imports = array(plan.get("graphImports"), "stash graph imports")?;
    if !imports.is_empty() {
        startup.committed = true;
    }
    let staged: Value = engine.request(&json!({"kind":"commandStashStageGraph","token":token}))?;
    check(&staged, token)?;
    let versions = allocations(root, &selected, plan)?;
    let finalized: Value = engine.request(&json!({"kind":"commandStashFinalize","token":token,
        "versions":versions,"bitVersion":receipt::NodeCli::find()?.version,"message":message}))?;
    check(&finalized, token)
}

fn allocations(root: &Path, selected: &[String], plan: &Value) -> io::Result<Vec<Value>> {
    let hashes = receipt::new_snap_hashes(selected.len())?;
    let fallback = identities(&plan["needsLog"])?;
    let user = if fallback.is_empty() { None } else { Some(receipt::User::load(root)?) };
    Ok(selected
        .iter()
        .zip(hashes)
        .map(|(identity, hash)| {
            let mut row = json!({"identity":identity,"hash":hash});
            if fallback.contains(identity)
                && let Some(user) = &user
            {
                row["log"] = user.log();
            }
            row
        })
        .collect())
}
