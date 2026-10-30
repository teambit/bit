//! Native `bit lane diff` handling when a base version object is missing on the filesystem.

use super::{list, show};
use crate::{
    commands::{
        color::Chalk,
        diff::{files, git},
        engine::Engine,
        status::js::{array, text, truthy},
        workspace_command::{self, results::Report},
    },
    native::Outcome,
    workspace,
};
use serde_json::{Value, json};
use std::{env, ffi::OsString, io, path::Path};

/// Handle `bit lane diff [values...]` inside a workspace when a component's base
/// version object is absent from the local scope.
pub(super) fn run(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    let Some(values) = parse_values(lane_args) else {
        return Ok(Outcome::Declined("outside the native lane diff grammar".into()));
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return outside_workspace_diff(&cwd, args, &values);
    };
    if let Some(err_msg) = validate_workspace_diff(&root, &values)
        && env::var_os("CI").is_none_or(|val| val.is_empty())
    {
        return workspace_command::execute_then(&root, args, "diff", |_| {
            Err(io::Error::other(err_msg))
        });
    }
    let Some((from_lane, to_lane)) = select_lanes(&root, &values) else {
        return Ok(Outcome::Declined("lane diff lanes outside native support".into()));
    };
    let mut engine = Engine::new()?;
    let listed: Value = engine.request(&json!({"kind": "scopeList", "root": &root}))?;
    let models = array(listed.get("components"), "models")?;
    let Some(data) =
        build_report(&mut engine, &root, models, &from_lane, &to_lane, Chalk::detect(args))?
    else {
        return Ok(Outcome::Declined("lane diff without missing local version objects".into()));
    };
    let report = Report { data, code: 0, details: None };
    workspace_command::execute_with(&root, args, "diff", &report, |_| Ok(()))
}

fn outside_workspace_diff(cwd: &Path, args: &[OsString], values: &[&str]) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    }
    let msg = match values {
        [] => Some(r#"expect "values" to include at least one arg - the lane name"#.to_owned()),
        ["main"] => {
            Some(r#"unable to run diff between "main" and "main", they're the same lane"#.to_owned())
        }
        [from, to] if from == to => Some(format!(
            r#"unable to run diff between "{from}" and "{to}", they're the same lane"#,
        )),
        _ if values.len() > 2 => Some(format!(
            r#"expect "values" to include no more than two args, got {}"#,
            values.len(),
        )),
        _ if super::scope_root::discover()
            .ok()
            .flatten()
            .is_none() =>
        {
            Some("Cannot read properties of undefined (reading 'legacyScope')".to_owned())
        }
        _ => None,
    };
    let Some(err_msg) = msg else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    workspace_command::execute_failure_scope(
        cwd,
        args,
        "diff",
        false,
        "",
        io::Error::other(err_msg),
    )
}

fn validate_workspace_diff(root: &Path, values: &[&str]) -> Option<String> {
    if values.len() > 2 {
        return Some(format!(
            r#"expect "values" to include no more than two args, got {}"#,
            values.len(),
        ));
    }
    let (_, (current, _)) = list::read_for_scope(root, false, false).ok()?;
    let current_name = current["name"].as_str().unwrap_or("main");
    if values.is_empty() && current_name == "main" {
        return Some(
            "you are currently on the default branch, to run diff between lanes, please specify them"
                .to_owned(),
        );
    }
    let (from_name, to_name) = resolve_lane_names(values, current_name)?;
    (from_name == to_name).then(|| {
        format!(
            r#"unable to run diff between "{from_name}" and "{to_name}", they're the same lane"#,
        )
    })
}

fn select_lanes(root: &Path, values: &[&str]) -> Option<(list::LaneData, list::LaneData)> {
    let (lanes, (current, _)) = list::read_for_scope(root, false, false).ok()?;
    let current_name = current["name"].as_str().unwrap_or("main");
    let (from_name, to_name) = resolve_lane_names(values, current_name)?;
    if from_name == to_name {
        return None;
    }
    let from_lane = show::find(&lanes, from_name)?.clone();
    let to_lane = show::find(&lanes, to_name)?.clone();
    if to_lane.is_main() || to_lane.components.is_empty() {
        return None;
    }
    Some((from_lane, to_lane))
}

fn parse_values<'a>(lane_args: &[&'a str]) -> Option<Vec<&'a str>> {
    if lane_args
        .iter()
        .any(|arg| arg.starts_with('-') || arg.is_empty())
    {
        return None;
    }
    Some(lane_args.to_vec())
}

fn resolve_lane_names<'a>(values: &[&'a str], current_name: &'a str) -> Option<(&'a str, &'a str)> {
    match values {
        [] if current_name != "main" => Some(("main", current_name)),
        [from] => Some((*from, current_name)),
        [from, to] => Some((*from, *to)),
        _ => None,
    }
}

enum Step {
    Abort,
    Skip,
    Missing(String, String),
    Diff(String),
}

fn build_report(
    engine: &mut Engine,
    root: &Path,
    models: &[Value],
    from_lane: &list::LaneData,
    to_lane: &list::LaneData,
    chalk: Chalk,
) -> io::Result<Option<String>> {
    let mut diffs = Vec::new();
    let mut failures = Vec::new();
    for component in &to_lane.components {
        match inspect_component(engine, root, models, (from_lane, to_lane), component, chalk)? {
            Step::Abort => return Ok(None),
            Step::Skip => {}
            Step::Missing(full_id, msg) => failures.push((full_id, msg)),
            Step::Diff(rendered) => diffs.push(rendered),
        }
    }
    if failures.is_empty() {
        return Ok(None);
    }
    Ok(Some(format!("{}{}", diffs.join("\n\n"), format_failures(&failures, chalk))))
}

fn inspect_component(
    engine: &mut Engine,
    root: &Path,
    models: &[Value],
    (from_lane, to_lane): (&list::LaneData, &list::LaneData),
    component: &Value,
    chalk: Chalk,
) -> io::Result<Step> {
    let objects_dir = bit_object_import::scope_path(root).join("objects");
    let id = text(component.get("id"))?;
    let to_head = text(component.get("head"))?;
    let Some(from_head) = find_model(models, id)
        .filter(|_| has_object(&objects_dir, to_head))
        .and_then(|model| resolve_from_head(from_lane, model, id))
    else {
        return Ok(Step::Abort);
    };
    if from_head == to_head {
        return Ok(Step::Skip);
    }
    if !has_object(&objects_dir, from_head) {
        return Ok(Step::Missing(format!("{id}@{to_head}"), missing_message(id, from_head, chalk)));
    }
    let labels = (
        from_lane.id["name"].as_str().unwrap_or("main"),
        to_lane.id["name"].as_str().unwrap_or_default(),
    );
    Ok(match diff_component(engine, root, id, (from_head, to_head), labels, chalk)? {
        Some(rendered) => Step::Diff(rendered),
        None => Step::Skip,
    })
}

fn missing_message(id: &str, from_head: &str, chalk: Chalk) -> String {
    format!(
        "error: version \"{}\" of component {} was not found on the filesystem.\ntry running \"bit import\". if it doesn't help, try running \"bit import {id} --objects --all-history\"",
        chalk.bold(from_head),
        chalk.bold(id),
    )
}

fn format_failures(failures: &[(String, String)], chalk: Chalk) -> String {
    let title = if chalk.enabled() {
        "\u{1b}[7m\u{1b}[27m\n\u{1b}[7m\u{1b}[27m\n\u{1b}[7mDiff failed on the following component(s)\u{1b}[27m"
    } else {
        "\n\nDiff failed on the following component(s)"
    };
    let rows = failures
        .iter()
        .map(|(full_id, msg)| format!("{full_id} - {}", chalk.red(msg)))
        .collect::<Vec<_>>()
        .join("\n");
    format!("{title}\n{rows}")
}

fn find_model<'a>(models: &'a [Value], identity: &str) -> Option<&'a Value> {
    models
        .iter()
        .find(|model| {
            format!(
                "{}/{}",
                model["scope"].as_str().unwrap_or_default(),
                model["name"].as_str().unwrap_or_default(),
            ) == identity
        })
}

fn resolve_from_head<'a>(
    from_lane: &'a list::LaneData,
    model: &'a Value,
    identity: &str,
) -> Option<&'a str> {
    if !from_lane.is_main()
        && let Some(head) = from_lane.components
            .iter()
            .find(|comp| comp["id"].as_str() == Some(identity))
            .and_then(|comp| comp["head"].as_str())
    {
        return Some(head);
    }
    model["head"].as_str()
}

fn has_object(objects_dir: &Path, hash: &str) -> bool {
    hash.len() > 2
        && objects_dir
            .join(&hash[..2])
            .join(&hash[2..])
            .is_file()
}

fn diff_component(
    engine: &mut Engine,
    root: &Path,
    identity: &str,
    (from_version, to_version): (&str, &str),
    (from_label, to_label): (&str, &str),
    chalk: Chalk,
) -> io::Result<Option<String>> {
    let row: Value = engine.request(&json!({
        "kind": "versionDiff",
        "root": root,
        "identity": identity,
        "fromVersion": from_version,
        "toVersion": to_version,
        "gitExecutable": git::executable(root)?,
        "color": true,
    }))?;
    let mut file_diffs = Vec::new();
    for file in array(row.get("files"), "diff files")? {
        if truthy(file.get("same")) {
            continue;
        }
        let path = text(file.get("relativePath"))?;
        let path = if cfg!(windows) { path.replace('/', r"\") } else { path.to_owned() };
        let raw = text(file.get("rawDiff"))?;
        let raw = raw
            .strip_suffix('\n')
            .map_or(raw, |raw| raw.strip_suffix('\r').unwrap_or(raw));
        let formatted = files::format(raw, from_label, to_label, &path);
        if !formatted.is_empty() {
            file_diffs.push(formatted);
        }
    }
    if file_diffs.is_empty() {
        return Ok(None);
    }
    let title = format!("showing diff for {}", chalk.bold(identity));
    let separator = "-".repeat(title.len());
    let header = chalk.cyan(&format!("{separator}\n{title}\n{separator}"));
    Ok(Some(format!("{header}\n{}\n", file_diffs.join("\n"))))
}
