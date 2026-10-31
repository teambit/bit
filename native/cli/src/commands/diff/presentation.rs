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
    let identity = text(row.get("identity"))?.trim();
    let target = find_captured_target(capture, identity)
        .ok_or_else(|| decline("diff row without a captured target"))?;
    let version = target
        .get("version")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty() && !matches!(*value, "latest" | "head"))
        .or_else(|| {
            target
                .get("head")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty() && !matches!(*value, "latest" | "head"))
        });
    let versions = resolve_versions(version, from_version, to_version);
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
        "_fullId": version.map_or_else(|| identity.to_string(), |ver| format!("{identity}@{ver}")),
        "hasDiff": !files_diff.is_empty() || fields_diff.is_some(),
        "filesDiff": files_diff,
    });
    if let Some(fields_diff) = fields_diff {
        output["fieldsDiff"] = json!(fields_diff);
    }
    Ok(output)
}

fn find_captured_target<'a>(capture: &'a Capture, identity: &str) -> Option<&'a Value> {
    let identity = identity.trim();
    let bare = identity.rsplit_once('@').map_or(identity, |(base, _)| base.trim());
    capture.captured
        .iter()
        .find(|item| {
            item["identity"]
                .as_str()
                .map(str::trim)
                .is_some_and(|cand| {
                    cand == identity
                        || cand.rsplit_once('@').map_or(cand, |(base, _)| base.trim()) == bare
                })
        })
}

fn resolve_versions<'a>(
    version: Option<&'a str>,
    from_version: Option<&'a str>,
    to_version: Option<&'a str>,
) -> Versions<'a> {
    let from_clean = from_version
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let to_clean = to_version
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let default_version = version
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("latest");
    Versions {
        left: from_clean.unwrap_or(default_version),
        right: to_clean.unwrap_or(default_version),
        historical: to_clean.is_some(),
    }
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
