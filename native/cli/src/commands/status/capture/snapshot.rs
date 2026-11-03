//! Published pre-snapshot callback facts, without `JavaScript` VCS publication.
//!
//! [`snapshot_host`], [`snapshot_hydrate`], [`snapshot_data`], and [`snapshot_pre_snap`] prepare environment task discovery for [`Capture`] and [`Engine`].

use super::{super::js::text, Capture, Engine, Value, array, decline, io, json};

/// Prepares default-environment task discovery via [`crate::host::Host`] after native snapshot preflight succeeds, before [`snapshot_hydrate`].
pub fn snapshot_host(
    capture: &Capture,
    root: &std::path::Path,
    params: &Value,
) -> io::Result<Option<crate::host::Host>> {
    if capture.cache.callbacks.host.is_some()
        || params["soft"] == true
        || capture.captured.is_empty()
    {
        return Ok(None);
    }
    let crate::discovery::Target::Entry(cli) = crate::discovery::find()? else {
        return Err(decline("snapshot task discovery needs installed Harmony"));
    };
    Ok(Some(crate::host::Host::new(cli, root.to_owned(), false)))
}

/// Retain hosted default component metadata before planned tasks are requested.
#[inline]
pub fn snapshot_hydrate(
    capture: &mut Capture,
    context: &Value,
    host: crate::host::Host,
) -> io::Result<()> {
    let result =
        super::super::environments::callbacks::load(&host, context, capture, false, true, false);
    capture.cache.retain_callback_stdout(&host.take_stdout());
    capture.cache.retain_callback_host(Some(host));
    result.map(|_| ())
}

/// Per-component aspect data returned by hydrated snapshot callbacks.
#[must_use]
#[inline]
pub fn snapshot_data<'a>(capture: &'a Capture, identity: &str) -> Option<&'a Value> {
    capture.cache.callbacks.snapshot_data.get(identity.trim())
}

/// Validate the native capture before invoking the selected components' pre-snap slots.
/// The returned physical-source changes require a native material refresh before publication.
pub fn snapshot_pre_snap(
    engine: &mut Engine,
    capture: &mut Capture,
    selected: &[String],
    automatic: &[String],
    params: &Value,
) -> io::Result<Value> {
    let valid: Value = engine.request(
        &json!({"kind":"dependencyFreshValidate","readSet":capture.dependency_read_set()}),
    )?;
    if valid["fresh"] != true {
        return Err(decline("snapshot callback inputs changed"));
    }
    let directory = tempfile::Builder::new().prefix("bit-native-presnap-").tempdir()?;
    let Some(host) = capture.cache.callbacks.host.take() else {
        return Ok(json!({"changedWorkspaceSources":[]}));
    };
    let result = host.call("snapshotPreSnap", &json!({"selected":selected,"automatic":automatic,"params":params,"directory":directory.path()}));
    capture.cache.retain_callback_stdout(&host.take_stdout());
    capture.cache.callbacks.host = Some(host);
    let output = result?;
    capture.cache.retain_callback_directory(directory);
    capture.cache.retain_callback_stdout(output["stdout"].as_str().unwrap_or_default());
    replace_source_proofs(capture, &output["value"])?;
    for row in array(output["value"].get("components"), "pre-snapshot components")? {
        super::super::environments::callbacks::apply(capture, row)?;
    }
    Ok(output["value"].clone())
}

/// Replaces source file proofs in `capture` ([`Capture`]) for each entry in `output["changedWorkspaceSources"]`.
#[inline]
fn replace_source_proofs(capture: &mut Capture, output: &Value) -> io::Result<()> {
    for change in array(output.get("changedWorkspaceSources"), "pre-snapshot source changes")? {
        replace_single_proof(capture, &change["before"], &change["after"]);
    }
    Ok(())
}

/// Replaces any read receipt matching `before` with `after` across `capture.cache` ([`Capture`]) pending entries and environment reads.
#[inline]
fn replace_single_proof(capture: &mut Capture, before: &Value, after: &Value) {
    for entry in capture.cache.pending.iter_mut().chain(&mut capture.cache.replacements) {
        entry.replace_source_proof(before, after);
    }
    for proof in &mut capture.cache.environment_reads {
        if proof == before {
            *proof = after.clone();
        }
    }
}

/// Whether lifecycle callbacks require the published aspect host.
#[must_use]
#[inline]
pub fn snapshot_required(capture: &Capture, _context: &Value, params: &Value) -> bool {
    capture.cache.callbacks.host.is_some() || snapshot_params_require_host(params)
}

#[inline]
fn snapshot_params_require_host(params: &Value) -> bool {
    let editor_enabled = params["editor"].as_bool() == Some(true)
        || params["editor"]
            .as_str()
            .is_some_and(|editor| {
                let trimmed = editor
                    .trim()
                    .trim_matches(['"', '\''])
                    .trim();
                !trimmed.is_empty()
                    && !["false", "0", "no", "off"]
                        .iter()
                        .any(|falsy| trimmed.eq_ignore_ascii_case(falsy))
            });
    let build_enabled = params["build"].as_bool() == Some(true)
        || params["build"]
            .as_str()
            .is_some_and(|build| {
                let trimmed = build
                    .trim()
                    .trim_matches(['"', '\''])
                    .trim();
                trimmed == "1" || trimmed.eq_ignore_ascii_case("true")
            });
    editor_enabled || build_enabled
}

/// Run the published message editor without loading or serializing a component graph.
pub fn snapshot_editor(
    capture: &Capture,
    selected: &[String],
    automatic: &[String],
    editor: &Value,
    root: &std::path::Path,
) -> io::Result<Value> {
    let target = crate::discovery::find()?;
    let crate::discovery::Target::Entry(cli) = target else {
        return Err(decline("snapshot editor needs installed Harmony"));
    };
    let host = crate::host::Host::new(cli, root.to_owned(), false);
    let host = capture.cache.callbacks.host.as_ref().unwrap_or(&host);
    let result = host.call("snapshotEditor", &json!({"selected":selected,"automatic":automatic,"editor":editor,"scope":bit_object_import::scope_path(root)}));
    capture.cache.retain_callback_stdout(&host.take_stdout());
    let output = result?;
    capture.cache.retain_callback_stdout(output["stdout"].as_str().unwrap_or_default());
    Ok(output["value"].clone())
}

/// Build pipelines consume staged native objects and return only metadata and artifact paths.
pub fn snapshot_build(
    capture: &mut Capture,
    root: &std::path::Path,
    staged_objects: &Value,
    versions: &Value,
    params: &Value,
) -> io::Result<Value> {
    let directory = tempfile::Builder::new().prefix("bit-native-build-").tempdir()?;
    if capture.cache.callbacks.host.is_none() {
        let crate::discovery::Target::Entry(cli) = crate::discovery::find()? else {
            return Err(decline("snapshot build needs installed Harmony"));
        };
        capture.cache.callbacks.host = Some(crate::host::Host::new(cli, root.to_owned(), false));
    }
    let host =
        capture.cache.callbacks.host.as_ref().ok_or_else(|| decline("snapshot builder host"))?;
    let result = host.call("snapshotBuild", &json!({"stagedObjects":staged_objects,"versions":versions,"params":params,"directory":directory.path()}));
    capture.cache.retain_callback_stdout(&host.take_stdout());
    let output = result?;
    let mut value = output["value"].clone();
    value["artifactRoot"] = json!(directory.path());
    capture.cache.retain_callback_directory(directory);
    capture.cache.retain_callback_stdout(output["stdout"].as_str().unwrap_or_default());
    Ok(value)
}

/// Registry existence facts use the released registry and credential adapters only.
pub fn snapshot_registry(
    capture: &mut Capture,
    root: &std::path::Path,
    candidates: &Value,
) -> io::Result<Value> {
    if capture.cache.callbacks.host.is_none() {
        let crate::discovery::Target::Entry(cli) = crate::discovery::find()? else {
            return Err(decline("registry facts need installed Harmony"));
        };
        capture.cache.callbacks.host = Some(crate::host::Host::new(cli, root.to_owned(), false));
    }
    let host = capture.cache.callbacks.host.as_ref().ok_or_else(|| decline("registry host"))?;
    let result = host.call("registryPublished", &json!({"candidates":candidates}));
    capture.cache.retain_callback_stdout(&host.take_stdout());
    let output = result?;
    capture.cache.retain_callback_stdout(output["stdout"].as_str().unwrap_or_default());
    Ok(output["value"].clone())
}

/// Apply registered package metadata callbacks to bases generated and retained by Rust.
pub fn snapshot_package_manifests(capture: &Capture, plans: &Value) -> io::Result<Value> {
    let host = capture.cache.callbacks.host
        .as_ref()
        .ok_or_else(|| decline("snapshot package callback host"))?;
    let result = host.call("snapshotPackageManifests", &json!({"plans":plans}));
    capture.cache.retain_callback_stdout(&host.take_stdout());
    let output = result?;
    capture.cache.retain_callback_stdout(output["stdout"].as_str().unwrap_or_default());
    Ok(output["value"].clone())
}

/// Only blocking workspace issues participate in snapshot gates.
pub fn snapshot_workspace_issues(
    capture: &Capture,
    root: &std::path::Path,
) -> io::Result<Vec<String>> {
    let mut issues = Vec::new();
    if bit_install::config::MergeConfig::load(root)?.has_conflict("WORKSPACE") {
        issues.push(format!(
            "unable to parse the merge-conflict file {} as it has unresolved conflicts",
            root.join("merge-conflict").display(),
        ));
    }
    if let Some(host) = capture.cache.callbacks.host.as_ref() {
        let result = host.call("snapshotWorkspaceIssues", &json!({}));
        capture.cache.retain_callback_stdout(&host.take_stdout());
        let extra: Vec<String> = serde_json::from_value(result?).map_err(io::Error::other)?;
        for issue in extra {
            let trimmed = issue.trim();
            if !trimmed.is_empty()
                && !issues
                    .iter()
                    .any(|existing| existing == trimmed)
            {
                issues.push(trimmed.to_owned());
            }
        }
    }
    Ok(issues)
}

/// Adopt control proofs returned by the native retained publication owner.
pub fn snapshot_control_reads(capture: &mut Capture, reads: &Value) -> io::Result<()> {
    for after in array(Some(reads), "published control reads")? {
        let path = text(after.get("path"))?.trim();
        if path.is_empty() {
            return Err(decline("published control read path"));
        }
        let before = capture
            .dependency_read_set()
            .into_iter()
            .filter(|proof| proof["path"].as_str().map(str::trim) == Some(path))
            .collect::<Vec<_>>();
        for before in before {
            replace_single_proof(capture, &before, after);
        }
    }
    Ok(())
}
