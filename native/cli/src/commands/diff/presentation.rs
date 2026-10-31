//! CLI presentation after native diff preflight.

use super::{
    Capture, Prepared, array, capture, decline, metadata, model, options, progress, result_files,
    text,
};
use crate::{
    commands::{
        color::Chalk,
        status::js::truthy,
        workspace_command::{self, results::Report},
    },
    native::Outcome,
};
use serde_json::{Value, json};
use std::{
    ffi::OsString,
    io::{self, Write},
    path::Path,
};

struct Versions<'a> {
    left: &'a str,
    right: &'a str,
    historical: bool,
}

pub(super) fn run_report(
    root: &Path,
    args: &[OsString],
    options: &options::Options,
    result: &Value,
    prepared: &mut Prepared,
) -> io::Result<Outcome> {
    let data = super::report::format(result, Chalk::detect(args), options)?;
    let report = Report { data, code: 0, details: None };
    prepared.commit(root)?;
    io::stdout().write_all(capture::callback_startup_stdout(&prepared.capture).as_bytes())?;
    workspace_command::execute_with(root, args, "diff", &report, |output| {
        for count in &prepared.selector_loads {
            output.status(&format!("loading {count} component(s)"));
        }
        progress::render_progress(output, root, options, result, prepared.loaded);
        output.raw(&capture::callback_load_stdout(&prepared.capture));
        Ok(())
    })
}

/// One `DiffJson` row.
pub(super) fn one(
    context: &Value,
    capture: &Capture,
    row: &Value,
    chalk: Chalk,
    from_version: Option<&str>,
    to_version: Option<&str>,
) -> io::Result<Value> {
    let identity = text(row.get("identity"))?;
    let target = capture.captured
        .iter()
        .find(|item| item["identity"] == identity);
    let target = target.ok_or_else(|| decline("diff row without a captured target"))?;
    let version = target
        .get("version")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty());
    let versions = Versions {
        left: from_version.unwrap_or_else(|| version.unwrap_or("latest")),
        right: to_version.unwrap_or_else(|| version.unwrap_or("latest")),
        historical: to_version.is_some(),
    };
    let files_diff = result_files::files_diff(row, versions.left, versions.right)?;
    let fields_diff = if target["_removed"] == true && !versions.historical {
        None
    } else {
        match row
            .get("model")
            .filter(|stored| truthy(Some(stored)))
        {
            None => None,
            Some(stored) => fields_diff(context, target, stored, row, chalk, &versions)?,
        }
    };
    let mut output = json!({
        "id": identity,
        "_fullId": version.map_or_else(|| identity.to_string(), |version| format!("{identity}@{version}")),
        "hasDiff": !files_diff.is_empty() || fields_diff.is_some(),
        "filesDiff": files_diff,
    });
    if let Some(fields_diff) = fields_diff {
        output["fieldsDiff"] = json!(fields_diff);
    }
    Ok(output)
}

/// `diffMetadata` of the stored version and the workspace's current state.
fn fields_diff(
    context: &Value,
    target: &Value,
    stored: &Value,
    row: &Value,
    chalk: Chalk,
    versions: &Versions<'_>,
) -> io::Result<Option<Vec<Value>>> {
    let side = metadata::Component {
        target,
        model: model(context, target),
        verbose: target["_verbose"] == true,
    };
    let peers = if versions.historical {
        array(row["current"].get("peerDependencies"), "peer dependencies")?
    } else {
        array(target.get("peerDependencies"), "peer dependencies")?
    };
    let left_peers = if versions.historical {
        array(stored.get("peerDependencies"), "peer dependencies")?
    } else {
        &[]
    };
    let left = side.side(stored, left_peers, false)?.with_version(versions.left);
    let right = side
        .side(&row["current"], peers, !versions.historical)?
        .with_version(versions.right);
    metadata::diff(&left, &right, chalk)
}
