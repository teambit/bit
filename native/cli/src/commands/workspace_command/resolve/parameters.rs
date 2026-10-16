//! `SnappingMain.snap` and `tag` parameters visible to published lifecycle hooks.

use super::{ResolveRequest, Selection, workflow::Workflow};
use serde_json::{Value, json};
use std::path::Path;

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
        Selection::Resolve { .. } => {}
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
    if let Some(path) = options["versionsFile"]["path"].as_str() {
        params["versionsFile"] = json!(path);
    }
    if options["soft"] == true {
        params["build"] = json!(false);
    }
    params["skipPublishedVersions"] = json!(false);
}
