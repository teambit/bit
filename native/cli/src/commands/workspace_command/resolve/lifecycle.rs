//! Run published extension hooks between native selection and version allocation.

use super::{Session, check_token, component_receipts, workflow::Workflow};
use crate::commands::status::{
    autosync::Startup,
    capture,
    js::{array, text},
};
use serde_json::{Value, json};
use std::io;

pub(super) fn before_snapshot(
    session: &mut Session<'_>,
    plan: &Value,
    request: &super::ResolveRequest<'_>,
    needs_snap: &[String],
    lifecycle: &mut Option<(&Workflow, &mut Startup)>,
) -> io::Result<Value> {
    if let Some((_, startup)) = lifecycle.as_mut() {
        issue_progress(plan, &session.capture, startup, request.kind == super::Kind::Resolve)?;
    }
    super::Resolved { root: session.root, context: &session.context, capture: &session.capture }
        .validate_issues(
            needs_snap,
            plan.get("issueGraph"),
            &request.options["policy"]["ignoreIssues"],
            &plan["selectedIds"],
            request.kind == super::Kind::Resolve,
            lifecycle.as_mut().map(|(_, startup)| &mut **startup),
        )?;
    if let Some((_, startup)) = lifecycle.as_mut()
        && let Some(tail) = startup.snapshot_tail.take()
    {
        startup.snapshot_events.push((tail, String::new()));
    }
    if let Some((workflow, startup)) = lifecycle.as_mut() {
        let params = super::parameters::planned(session.root, request, workflow, plan);
        pre_snap(session, plan, workflow, startup, &params)
    } else {
        Ok(json!([]))
    }
}

pub(super) fn finish(
    session: &mut Session<'_>,
    plan: &mut Value,
    request: &super::ResolveRequest<'_>,
    lifecycle: Option<(&Workflow, &mut Startup)>,
) -> io::Result<()> {
    if let Some((workflow, startup)) = lifecycle {
        let params = super::parameters::planned(session.root, request, workflow, plan);
        build(session, plan, workflow, startup, &params)?;
        packages(session, plan, startup)?;
    }
    Ok(())
}

pub(super) fn issue_progress(
    plan: &Value,
    capture: &capture::Capture,
    startup: &mut Startup,
    resolving: bool,
) -> io::Result<()> {
    let mut prefix = plan["progress"].clone();
    let loads = array(prefix.get("loads"), "snapshot issue progress")?;
    if loads.is_empty() {
        return Ok(());
    }
    let split = if resolving { 2.min(loads.len()) } else { loads.len() - 1 };
    let (before, after) = loads.split_at(split);
    let mut tail = prefix.clone();
    tail["loads"] = json!(after);
    tail["imports"] = json!([]);
    tail["snapFailed"] = json!(true);
    tail["versionNotice"] = json!("");
    prefix["loads"] = json!(before);
    prefix["snapFailed"] = json!(true);
    prefix["versionNotice"] = json!("");
    load_events(prefix, capture, startup)?;
    startup.snapshot_tail = Some(tail);
    Ok(())
}

fn load_events(
    mut progress: Value,
    capture: &capture::Capture,
    startup: &mut Startup,
) -> io::Result<()> {
    let loads = array(progress.get("loads"), "snapshot callback progress")?.to_vec();
    let outputs = capture.environment_facts["snapshotLoadOutput"].as_array();
    let environment_loads =
        capture.environment_facts["snapshotEnvironmentLoads"].as_array().map_or(0, Vec::len);
    let mut consumed = 0;
    for (pass, output) in outputs
        .into_iter()
        .flatten()
        .enumerate()
    {
        let end = if pass == 0 { 1 + environment_loads } else { loads.len() }.min(loads.len());
        progress["loads"] = json!(&loads[consumed..end]);
        startup.snapshot_events.push((progress.clone(), text(Some(output))?.to_owned()));
        progress["versionNotice"] = json!("");
        consumed = end;
    }
    progress["loads"] = json!(&loads[consumed..]);
    startup.snapshot_events.push((progress, String::new()));
    Ok(())
}

pub(super) fn callback_output(startup: &mut Startup, text: &str) {
    if let Some((_, output)) = startup.snapshot_events.last_mut() {
        output.push_str(text);
    } else {
        startup.stdout.push_str(text);
    }
}

pub(super) fn packages(
    session: &mut Session<'_>,
    plan: &Value,
    startup: &mut Startup,
) -> io::Result<()> {
    let Some(plans) = plan["packageManifestPlans"]
        .as_array()
        .filter(|plans| !plans.is_empty())
    else {
        return Ok(());
    };
    if !plans
        .iter()
        .any(|plan| {
            plan["identity"]
                .as_str()
                .is_some_and(|id| capture::snapshot_data(&session.capture, id).is_some())
        })
    {
        return Ok(());
    }
    startup.committed = true;
    startup.build_progress = Some(plan["progress"].clone());
    let staged: Value = session.engine.request(
        &json!({"kind":"commandSnapshotStagePackages", "token":session.token}),
    )?;
    check_token(&staged, &session.token)?;
    capture::snapshot_control_reads(&mut session.capture, &staged["controlReadSet"])?;
    let before = capture::callback_load_stdout(&session.capture).len();
    let manifests = capture::snapshot_package_manifests(&session.capture, &json!(plans));
    startup.build_stdout.push_str(&capture::callback_load_stdout(&session.capture)[before..]);
    let manifests = manifests?;
    let finalized: Value = session.engine.request(&json!({
        "kind":"commandSnapshotPackageFinalize", "token":session.token,
        "manifests":manifests, "dependencyReadSet":session.capture.dependency_read_set(),
    }))?;
    check_token(&finalized, &session.token)
}

pub(in crate::commands) fn render_events(
    output: &bit_install::output::Output,
    startup: &Startup,
) -> io::Result<()> {
    use std::io::Write as _;
    for (progress, text) in &startup.snapshot_events {
        if let Some(progress) = super::super::progress::Progress::parse_snap(Some(progress))? {
            progress.render_merge(output);
        }
        io::stdout().write_all(text.as_bytes())?;
    }
    Ok(())
}

pub(super) fn pre_snap(
    session: &mut Session<'_>,
    plan: &Value,
    workflow: &Workflow,
    startup: &mut Startup,
    params: &Value,
) -> io::Result<Value> {
    if !capture::snapshot_required(&session.capture, &session.context, params) {
        return Ok(json!([]));
    }
    let selected = strings(&plan["selectedIds"])?;
    let automatic = strings(&plan["needsSnap"])?
        .into_iter()
        .filter(|id| !selected.contains(id))
        .collect::<Vec<_>>();
    let validated: Value = session.engine.request(&json!({
        "kind":"commandSnapshotValidate", "token":session.token,
        "dependencyReadSet":session.capture.dependency_read_set(),
    }))?;
    check_token(&validated, &session.token)?;
    startup.committed = true;
    let before = capture::callback_load_stdout(&session.capture).len();
    let result = capture::snapshot_pre_snap(
        &mut session.engine,
        &mut session.capture,
        &selected,
        &automatic,
        params,
    );
    callback_output(startup, &capture::callback_load_stdout(&session.capture)[before..]);
    let result = result?;
    refresh_sources(session, &result)?;
    if let Some(editor) = &workflow.editor {
        startup.committed = true;
        capture::snapshot_editor(
            &session.capture,
            &selected,
            &automatic,
            &json!(editor),
            session.root,
        )
    } else {
        Ok(json!([]))
    }
}

fn strings(value: &Value) -> io::Result<Vec<String>> {
    array(Some(value), "snapshot callback selection")?
        .iter()
        .map(|value| text(Some(value)).map(str::to_owned))
        .collect()
}

pub(super) fn messages(receipt: &mut Value, messages: &Value) -> io::Result<()> {
    receipt["messages"] = messages.clone();
    for message in array(Some(messages), "snapshot editor messages")? {
        let id = text(message.get("identity"))?;
        let text = text(message.get("message"))?;
        if let Some(versions) = receipt["versions"].as_array_mut() {
            let version = versions
                .iter_mut()
                .find(|row| row["identity"] == id)
                .ok_or_else(|| std::io::Error::other("snapshot editor component absent"))?;
            version["log"] = json!({"message":text});
        }
    }
    Ok(())
}

pub(super) fn build(
    session: &mut Session<'_>,
    plan: &mut Value,
    workflow: &Workflow,
    startup: &mut Startup,
    params: &Value,
) -> io::Result<()> {
    if !workflow.build {
        return Ok(());
    }
    startup.committed = true;
    startup.build_progress = Some(plan["progress"].clone());
    let staged: Value = session.engine.request(&json!({
        "kind":"commandSnapshotStageBuild", "token":session.token,
    }))?;
    check_token(&staged, &session.token)?;
    let versions = array(plan.get("versions"), "snapshot builder versions")?
        .iter()
        .map(|version| {
            let identity = text(version.get("identity"))?;
            let target = text(version.get("componentVersion"))?;
            Ok(json!({"identity":identity,"version":target}))
        })
        .collect::<io::Result<Vec<_>>>()?;
    let before = capture::callback_load_stdout(&session.capture).len();
    let built = capture::snapshot_build(
        &mut session.capture,
        session.root,
        &plan["stagedObjects"],
        &json!(versions),
        params,
    );
    startup.build_stdout.push_str(&capture::callback_load_stdout(&session.capture)[before..]);
    let built = built?;
    let finalized: Value = session.engine.request(&json!({
        "kind":"commandSnapshotBuildFinalize", "token":session.token,
        "versions":built["versions"], "artifactRoot":built["artifactRoot"], "artifacts":built["artifacts"],
        "dependencyReadSet":session.capture.dependency_read_set(),
    }))?;
    check_token(&finalized, &session.token)?;
    plan["packageManifestPlans"] = finalized["packageManifestPlans"].clone();
    Ok(())
}

/// Builder output follows native graph progress, including commands that fail in the builder.
pub(in crate::commands) fn render_build_output(
    output: &bit_install::output::Output,
    startup: &Startup,
    failed: bool,
) -> io::Result<()> {
    use std::io::Write as _;
    if failed {
        render_events(output, startup)?;
    }
    if failed
        && let Some(progress) =
            super::super::progress::Progress::parse_snap(startup.build_progress.as_ref())?
    {
        if startup.snapshot_events.is_empty() {
            progress.render_merge(output);
        } else {
            progress.render_graph(output);
        }
    }
    io::stdout().write_all(startup.build_stdout.as_bytes())
}

fn refresh_sources(session: &mut Session<'_>, result: &Value) -> io::Result<()> {
    let refreshed: Value = session.engine.request(&json!({
        "kind":"commandSnapshotRefresh", "token":session.token,
        "current":session.capture.captured,
        "components":component_receipts(&session.context, &session.capture)?,
        "dependencyReadSet":session.capture.dependency_read_set(),
        "sourceChanges":result.get("changedWorkspaceSources").cloned().unwrap_or_else(||json!([])),
    }))?;
    check_token(&refreshed, &session.token)
}
