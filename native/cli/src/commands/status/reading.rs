//! Read, compute, prepare presentation, then publish status caches and retained history.

use super::{
    Component, Engine, active_components, array, capture, current_lane_id, decline, grammar,
    issues, lane_refresh, loader, report, result_targets, semver_values, sort_rows, status_capture,
    text,
};
use serde_json::{Value, json};
use std::{io, path::Path};

/// The status result, after its history plans are
/// committed. `prepare` runs on the result and the context before the commit.
pub(super) enum ReadFailure {
    Declined(io::Error),
    Committed(io::Error),
}

impl From<io::Error> for ReadFailure {
    fn from(error: io::Error) -> Self {
        Self::Declined(error)
    }
}

pub(super) fn read<Prepared>(
    root: &Path,
    home: &Path,
    flags: &report::Flags,
    prepare: impl FnOnce(&Value, &Value) -> io::Result<Prepared>,
) -> Result<(Value, Prepared, loader::Progress), ReadFailure> {
    let mut startup = super::autosync::Startup::default();
    let result = read_prepared(root, home, flags, prepare, &mut startup);
    match result {
        Err(ReadFailure::Declined(error)) if startup.committed => {
            use std::io::Write;
            io::stdout().write_all(startup.stdout.as_bytes()).map_err(ReadFailure::Committed)?;
            Err(ReadFailure::Committed(error))
        }
        result => result,
    }
}

fn read_prepared<Prepared>(
    root: &Path,
    home: &Path,
    flags: &report::Flags,
    prepare: impl FnOnce(&Value, &Value) -> io::Result<Prepared>,
    startup: &mut super::autosync::Startup,
) -> Result<(Value, Prepared, loader::Progress), ReadFailure> {
    let mut engine = Engine::new()?;
    let (mut context, environments) =
        super::environments::read_context(&mut engine, root, home, true, None, startup)?;
    context["ignoreCircularDependencies"] = json!(flags.ignore_circular);
    let (mut result, capture, graph_proofs) =
        local_result(&mut engine, root, home, &context, Some(environments))?;
    let mut refreshes =
        lane_refresh::Refreshes::prepare(&mut engine, root, &context, &result, flags.lanes)?;
    refreshes.attach(&mut result, &context);
    attach_removed(&mut result, &capture, &context)?;
    sort_rows(root, &mut result)?;
    let prepared = prepare(&result, &context)?;
    validate_graph(&mut engine, &graph_proofs)?;
    capture::commit(&mut engine, root, &context, &capture).map_err(ReadFailure::Committed)?;
    let mut progress = callback_progress(refreshes.progress(&context), &capture);
    progress.startup_stdout.insert_str(0, &startup.stdout);
    refreshes.apply(&mut engine).map_err(ReadFailure::Committed)?;
    super::cleanup_temporary(root).map_err(ReadFailure::Committed)?;
    Ok((result, prepared, progress))
}

pub(super) fn local_result(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    context: &Value,
    environments: Option<super::environments::Environments>,
) -> io::Result<(Value, capture::Capture, Vec<Value>)> {
    let capture = status_capture(engine, root, home, context, environments)?;
    let compared: Value = engine.request(
        &json!({"kind": "statusCompare", "root": root, "targets": capture.comparisons}),
    )?;
    let (issues, graph_proofs) = captured_issues(engine, root, context, &capture)?;
    let issues = capture::issue_callbacks(context, &capture, &issues)?;
    let targets =
        result_targets(context, &capture.components, &capture.invalid, &compared, &issues)?;
    let semver = grammar::snapshot(semver_values(context, &targets)?.iter().map(String::as_str))
        .ok_or_else(|| decline("status semver grammar limits"))?;
    let current_lane_id = current_lane_id(context)?;
    let mut result: Value = engine.request(&json!({
        "kind": "statusResult",
        "currentLaneId": current_lane_id,
        "targets": targets,
        "models": context["models"],
        "histories": context["histories"],
        "semver": semver,
        "unavailableOnMain": context["unavailableOnMain"],
        "updateDependents": context["updateDependents"],
        "duringMerge": during_merge(context)?,
    }))?;
    result["workspaceIssues"] = json!(super::workspace_issues::collect(root, &capture)?);
    Ok((result, capture, graph_proofs))
}

fn during_merge(context: &Value) -> io::Result<Vec<String>> {
    context["unmerged"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|row| {
            let (scope, name) = crate::commands::version_history::build::row_scope_and_name(row)
                .ok_or_else(|| decline("status unmerged identity"))?;
            Ok(format!("{scope}/{name}"))
        })
        .collect()
}

fn status_issues(
    engine: &mut Engine,
    root: &Path,
    context: &Value,
    components: &[Component],
) -> io::Result<(Vec<Value>, Vec<Value>)> {
    if let Some(issues) = issues::collect(root, context, components)? {
        return Ok((issues, Vec::new()));
    }
    if !issues::ordinary_model_heads(context)? {
        return Err(decline("status deprecated model issues require canonical loading"));
    }
    let response: Value = engine.request(&json!({"kind":"statusGraph","root":root,"versions":context["versions"],"components":components.iter().map(|component|json!({"identity":component.identity,"dependencies":component.dependencies})).collect::<Vec<_>>()}))?;
    let mut graph = components.to_vec();
    for row in array(response.get("external"), "external status graph")? {
        graph.push(Component {
            ignored: Vec::new(),
            identity: text(row.get("identity"))?.to_owned(),
            package_name: String::new(),
            dependencies: array(row.get("dependencies"), "external dependencies")?
                .iter()
                .map(|id| text(Some(id)).map(str::to_owned))
                .collect::<io::Result<_>>()?,
            issues: Value::Null,
        });
    }
    let mut issue_context = context.clone();
    issue_context["models"]
        .as_array_mut()
        .ok_or_else(|| decline("status models"))?
        .extend(array(response.get("models"), "external models")?.iter().cloned());
    issue_context["versions"]
        .as_array_mut()
        .ok_or_else(|| decline("status versions"))?
        .extend(array(response.get("versions"), "external head versions")?.iter().cloned());
    let issues = issues::collect_graph(root, &issue_context, components, &graph)?
        .ok_or_else(|| decline("status issue graph is incomplete"))?;
    Ok((issues, array(response.get("readSet"), "status graph proofs")?.to_vec()))
}

fn validate_graph(engine: &mut Engine, proofs: &[Value]) -> io::Result<()> {
    if proofs.is_empty() {
        return Ok(());
    }
    let response: Value =
        engine.request(&json!({"kind":"dependencyFreshValidate","readSet":proofs}))?;
    if response["fresh"] != true {
        return Err(decline("status dependency graph changed before commit"));
    }
    Ok(())
}

fn attach_removed(
    result: &mut Value,
    capture: &capture::Capture,
    context: &Value,
) -> io::Result<()> {
    let during = during_merge(context)?;
    result["remotelySoftRemoved"] = json!(
        capture.remotely_removed
            .iter()
            .filter(|id| !during.contains(id))
            .collect::<Vec<_>>()
    );
    Ok(())
}

fn callback_progress(
    mut progress: loader::Progress,
    capture: &capture::Capture,
) -> loader::Progress {
    progress.startup_stdout = capture::callback_startup_stdout(capture);
    progress.load_stdout = capture::callback_load_stdout(capture);
    progress.issue_stdout = capture::callback_issue_stdout(capture);
    progress
}

fn captured_issues(
    engine: &mut Engine,
    root: &Path,
    context: &Value,
    capture: &capture::Capture,
) -> io::Result<(Vec<Value>, Vec<Value>)> {
    let mut issue_context = context.clone();
    issue_context["environmentFacts"] = capture.environment_facts.clone();
    status_issues(engine, root, &issue_context, &active_components(context, &capture.components)?)
}
