//! Lane component [`metadata`], [`attach`], [`Additions`] discovery, and [`Candidates`] target selection.

use super::{Operation, Prepare, selected};
use crate::{
    command_import,
    workspace::engine::{client_status::config, invalid, status_context},
};
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

/// Discovers incoming lane additions, destinations, and tracked targets during [`attach`] checkout preparation.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct Additions {
    names: Vec<String>,
    destinations: Vec<Value>,
    targets: Vec<Value>,
    tracked: Vec<Value>,
    prospective: Vec<Value>,
}

/// Candidate selection parameters for filtering incoming lane [`Additions`] against workspace targets in [`attach`].
#[derive(Debug, Clone, PartialEq, Eq)]
struct Candidates<'a> {
    root: &'a Path,
    selected: std::collections::HashSet<String>,
    tracked: std::collections::HashSet<String>,
    targets: &'a [Value],
    inactive: &'a [Value],
    workspace_only: bool,
}

/// Computes workspace status metadata for `request`, filtering to visible lane targets during checkout.
pub(super) fn metadata(
    request: &Prepare,
    input: &status_context::Request,
    pool: &rayon::ThreadPool,
) -> io::Result<Value> {
    if request.operation != Operation::Checkout {
        return status_context::metadata(input, pool);
    }
    let bitmap = config::document(&request.root.join(".bitmap"))?;
    if bitmap.get("_bit_lane").is_none() {
        return status_context::metadata(input, pool);
    }
    let settings = config::configuration_value(
        &request.root,
        &status_context::configuration::effective(&request.root, &request.home)?,
        true,
    )?;
    let visible = super::super::lane_context::visibility::targets(&bitmap, &settings)?;
    status_context::metadata_with_targets(input, pool, &settings, visible)
}

/// Attaches `context["lane"]` metadata, inactive targets, and incoming lane additions during checkout.
pub(super) fn attach(
    request: &Prepare,
    context: &mut Value,
    imported: Option<&mut command_import::PreparedImport>,
    pool: &rayon::ThreadPool,
) -> io::Result<()> {
    if request.operation != Operation::Checkout {
        return Ok(());
    }
    let bitmap = config::document(&request.root.join(".bitmap"))?;
    if bitmap.get("_bit_lane").is_none() {
        if request.options.workspace_only {
            return Err(invalid("checkout workspace-only requires a lane"));
        }
        return Ok(());
    }
    let current_id = super::super::lane_context::current_id(&bitmap, &context["scope"])?;
    let imported = imported.ok_or_else(|| invalid("checkout lane import owner"))?;
    let to_head = request.options.to
        .as_deref()
        .map(str::trim)
        .is_some_and(|to| to.eq_ignore_ascii_case("head"));
    let current = if to_head {
        imported.resolve_other_lane(&current_id, false)?
    } else {
        imported.load_lane(&current_id)?
    }
    .ok_or_else(|| invalid("checkout current Lane absent"))?;
    if !imported.lane_import_histories().is_empty() {
        return Err(invalid("checkout fetched lane history requires canonical handling"));
    }
    let effective = status_context::configuration::effective(&request.root, &request.home)?;
    let settings = config::configuration_value(&request.root, &effective, true)?;
    let inactive = inactive_targets(request, context, &bitmap, &settings, &current, pool)?;
    let additions = if to_head {
        additions(request, context, imported, &bitmap, &settings, &current, &inactive)?
    } else {
        Additions::default()
    };
    context["lane"] = json!({"currentId":current_id,"current":current,"inactiveTargets":inactive,
        "newFromLane":additions.names,"additions":additions.destinations,
        "addedTargets":additions.targets,"trackedTargets":additions.tracked});
    Ok(())
}

fn inactive_targets(
    request: &Prepare,
    context: &Value,
    bitmap: &Value,
    settings: &Value,
    current: &command_import::lane::Record,
    pool: &rayon::ThreadPool,
) -> io::Result<Vec<Value>> {
    let heads = command_import::lane::entries(&current.value)?
        .into_iter()
        .map(|entry| entry.identity)
        .collect::<HashSet<_>>();
    let projected =
        super::super::lane_context::visibility::switch_targets(bitmap, settings, false, &heads)?;
    let active = context["targets"].as_array().ok_or_else(|| invalid("checkout active targets"))?;
    let selected = projected
        .into_iter()
        .filter(|row| {
            let row_id = row["identity"].as_str().map(str::trim);
            !active
                .iter()
                .any(|target| target["identity"].as_str().map(str::trim) == row_id)
        })
        .collect::<Vec<_>>();
    if selected.is_empty() {
        return Ok(Vec::new());
    }
    let input = status_context::Request {
        root: request.root.clone(),
        home: request.home.clone(),
        history: false,
    };
    let metadata = status_context::metadata_with_targets(&input, pool, settings, selected)?;
    metadata["targets"]
        .as_array()
        .cloned()
        .ok_or_else(|| invalid("checkout inactive targets"))
}

fn additions(
    request: &Prepare,
    context: &Value,
    imported: &mut command_import::PreparedImport,
    bitmap: &Value,
    settings: &Value,
    current: &command_import::lane::Record,
    inactive: &[Value],
) -> io::Result<Additions> {
    let selected = selected_identities(request, context)?;
    let bitmap = super::super::lane_context::visibility::identity_bitmap(bitmap, settings)?;
    let candidates = Candidates {
        root: &request.root,
        selected,
        tracked: bitmap_identities(&bitmap)?,
        targets: context["targets"].as_array().ok_or_else(|| invalid("checkout targets"))?,
        inactive,
        workspace_only: request.options.workspace_only,
    };
    let mut result = Additions::default();
    for entry in command_import::lane::entries(&current.value)? {
        collect_candidate(&entry, imported, &candidates, &mut result)?;
    }
    if request.options.workspace_only {
        return Ok(result);
    }
    result.destinations = super::super::lane_context::additions::prepare_switch(
        imported,
        &request.root,
        &bitmap,
        settings,
        &result.prospective,
    )?;
    result.targets =
        super::super::lane_context::additions::targets(&result.destinations, &result.prospective);
    Ok(result)
}

#[inline]
fn selected_identities(
    request: &Prepare,
    context: &Value,
) -> io::Result<std::collections::HashSet<String>> {
    Ok(selected(request, context)?
        .into_iter()
        .filter_map(|target| {
            target["identity"]
                .as_str()
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .map(str::to_owned)
        })
        .collect())
}

fn collect_candidate(
    entry: &command_import::lane::Entry,
    imported: &mut command_import::PreparedImport,
    candidates: &Candidates<'_>,
    result: &mut Additions,
) -> io::Result<()> {
    let identity = entry.identity.trim();
    if candidates.selected.contains(identity) || entry.hidden {
        return Ok(());
    }
    let version = imported.lane_version(entry.head.trim())?;
    if super::super::selection::removed(&version)? {
        return Ok(());
    }
    result.names.push(format!("{identity}@{}", entry.head.trim()));
    if candidates.workspace_only {
        return Ok(());
    }
    if candidates.tracked.contains(identity) {
        let target = candidates.targets
            .iter()
            .chain(candidates.inactive)
            .find(|row| row["identity"].as_str().map(str::trim) == Some(identity))
            .ok_or_else(|| invalid("checkout inactive lane row requires canonical writer"))?;
        let directory = target["directory"]
            .as_str()
            .map(str::trim)
            .filter(|dir| !dir.is_empty())
            .ok_or_else(|| invalid("checkout tracked lane directory"))?;
        if directory != "." {
            crate::checkout::plan::relative_path(directory)?;
        }
        if missing_root(&candidates.root.join(directory))? {
            result.prospective.push(json!({"identity":identity,"head":entry.head.trim(),
                "visible":false,"hidden":false,"currentIdPresent":false,"bitmapPresent":true}));
            return Ok(());
        }
        result.tracked.push(target.clone());
        return Ok(());
    }
    result.prospective.push(json!({"identity":identity,"head":entry.head.trim(),
        "visible":false,"hidden":false,"currentIdPresent":false,"bitmapPresent":false}));
    Ok(())
}

#[inline]
fn missing_root(path: &Path) -> io::Result<bool> {
    match path.symlink_metadata() {
        Ok(_) => Ok(false),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(true),
        Err(error) => Err(error),
    }
}

pub(super) fn bitmap_identities(bitmap: &Value) -> io::Result<std::collections::HashSet<String>> {
    let rows = bitmap.as_object().ok_or_else(|| invalid("checkout lane bitmap"))?;
    rows.iter()
        .filter(|(key, _)| {
            !key.starts_with('$') && !matches!(key.as_str(), "_bit_lane" | "version")
        })
        .map(|(key, row)| {
            let (row_scope, name) = crate::reset_lane::bitmap::row_identity(key, row);
            let scope = row_scope
                .map(str::trim)
                .filter(|scope| !scope.is_empty())
                .ok_or_else(|| invalid("checkout lane bitmap scope"))?;
            let name = name.trim();
            if name.is_empty() {
                return Err(invalid("checkout lane bitmap name"));
            }
            Ok(format!("{scope}/{name}"))
        })
        .collect()
}

pub(super) fn selected_heads(context: &Value, targets: &[Value]) -> io::Result<Vec<Value>> {
    let entries = command_import::lane::entries(&context["lane"]["current"]["value"])?;
    let heads = entries
        .into_iter()
        .filter(|entry| !entry.hidden)
        .map(|entry| entry.identity.trim().to_owned())
        .collect::<std::collections::HashSet<_>>();
    Ok(targets
        .iter()
        .filter(|target| {
            target["identity"]
                .as_str()
                .is_some_and(|id| heads.contains(id.trim()))
        })
        .cloned()
        .collect())
}
