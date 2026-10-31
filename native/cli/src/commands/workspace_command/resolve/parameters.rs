//! `SnappingMain.snap` and `tag` parameters visible to published lifecycle hooks.

use super::{
    Planned, ResolveRequest, Selection, receipts::validate_preparation, workflow::Workflow,
};
use crate::commands::{
    engine::Engine,
    status::{
        autosync::Startup,
        cache, capture, environments,
        fresh::dependency_grammar,
        js::{array, decline},
    },
};
use serde_json::{Value, json};
use std::{io, path::Path};

pub(super) fn planned(
    root: &Path,
    request: &ResolveRequest<'_>,
    workflow: &Workflow,
    plan: &Value,
) -> Value {
    let mut params = snapshot(root, request, workflow);
    if let Some(identity) = plan["autoAddedWorkspaceRoot"].as_str() {
        params["autoAddedWorkspaceRoot"] = json!(identity);
    }
    params
}

pub(super) fn snapshot(root: &Path, request: &ResolveRequest<'_>, workflow: &Workflow) -> Value {
    let mut params = workflow.parameters(request.kind);
    params["message"] = json!(request.options["message"].as_str().unwrap_or_default());
    params["packageManagerConfigRootDir"] = json!(root);
    params["ignoreNewestVersion"] = json!(request.options["policy"]["ignoreNewestVersion"] == true);
    params["noLockDeps"] = json!(request.options["policy"]["noLockDeps"] == true);
    if request.options["policy"]["rebuildDepsGraph"] == true {
        params["rebuildDepsGraph"] = json!(true);
    }
    for field in ["ignoreIssues"] {
        if !request.options["policy"][field].is_null() {
            params[field] = request.options["policy"][field].clone();
        }
    }
    match &request.selection {
        Selection::Snap { .. } => {
            params["skipAutoTag"] = json!(request.options["skipAutoSnap"] == true);
            params["persist"] = json!(true);
            params["soft"] = json!(false);
        }
        Selection::Tag { tag_options, .. } => {
            tag(&mut params, tag_options);
            params["skipPublishedVersions"] =
                json!(request.options["policy"]["skipPublishedVersions"] == true);
        }
        Selection::Resolve { .. } => {
            params["skipAutoTag"] = json!(false);
            params["persist"] = json!(true);
            params["soft"] = json!(false);
        }
    }
    params
}

fn tag(params: &mut Value, options: &Value) {
    for field in
        ["exactVersion", "releaseType", "autoTagReleaseType", "preReleaseId", "incrementBy"]
    {
        if !options[field].is_null() {
            params[field] = options[field].clone();
        }
    }
    for field in ["skipAutoTag", "soft", "persist"] {
        params[field] = json!(options[field] == true);
    }
    if let Some(path) = options["versionsFile"]
        .as_str()
        .or_else(|| options["versionsFile"]["path"].as_str())
        .filter(|path| !path.is_empty())
    {
        params["versionsFile"] = json!(path);
    }
    if options["soft"] == true {
        params["build"] = json!(false);
    }
    params["skipPublishedVersions"] = json!(false);
}

pub(super) fn session_environment(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    startup: Option<&mut Startup>,
    build: bool,
    inherited: Option<environments::Environments>,
) -> io::Result<Option<environments::Environments>> {
    if let Some(environment) = inherited {
        return environment.continue_snapshot(build).map(Some);
    }
    startup
        .map(|startup| {
            environments::read_snapshot_context(engine, root, home, build, startup)
                .map(|(_, environments)| environments)
        })
        .transpose()
}

/// `listTagPendingIds` populates missing lane history while checking staged snaps.
/// Stage the same read-proven write before the soft bitmap publication.
pub(super) fn stage_soft_history(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    context: &mut Value,
) -> io::Result<()> {
    let status: Value =
        engine.request(&json!({"kind":"statusContext","root":root,"home":home,"history":true}))?;
    if status["models"] != context["models"] {
        return Err(decline("soft tag history models changed"));
    }
    context["pendingHistory"] =
        json!(array(status.get("pendingHistory"), "soft tag pending history")?);
    Ok(())
}

pub(super) fn preparation(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    request: &ResolveRequest<'_>,
    callbacks: bool,
) -> io::Result<Value> {
    let mut prepare = json!({
        "kind": request.kind.request("Prepare"),
        "root": root,
        "home": home,
        "options": request.options,
        "dependencyGrammar": dependency_grammar()?,
        "globalRemotesFile": cache::cache_root().join("config").join("global-remotes.json"),
    });
    if callbacks && request.kind == super::Kind::Resolve {
        prepare["options"]["callbackLifecycle"] = json!(true);
    }
    if let Selection::Tag { tag_options, .. } = &request.selection {
        prepare["tagOptions"] = tag_options.clone();
    }
    let prepared: Value = engine.request(&prepare)?;
    validate_preparation(&prepared, request.kind)?;
    Ok(prepared)
}

impl Planned {
    pub(in crate::commands) fn has_captured_components(&self) -> bool {
        !self.capture.components.is_empty()
    }

    /// Move configured callbacks across native merge materialization and resolution.
    pub(in crate::commands) fn take_environment(&mut self) -> Option<environments::Environments> {
        capture::take_callback_environment(&mut self.capture)
    }

    pub(in crate::commands) fn restore_host(&mut self, host: crate::host::Host) {
        capture::restore_callback_host(&mut self.capture, host);
    }
}
