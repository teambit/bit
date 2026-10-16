//! Resolve checkout predicates against the prepared workspace before capturing selected targets.
use super::{Request, array, checkout_lifecycle, decline, text};
use crate::commands::{
    diff::selection,
    engine::Engine,
    patterns,
    status::{
        autosync::Startup,
        capture::{self, Capture, CaptureOptions},
        environments::Environments,
    },
};
use bit_install::policy::scope::read_proof;
use serde_json::{Value, json};
use std::{io, path::Path};

pub(super) struct Prepared<'a> {
    pub token: &'a str,
    pub context: &'a Value,
    pub targets: &'a [Value],
    pub environments: &'a mut Option<Environments>,
    pub startup: Option<&'a mut Startup>,
}

pub(super) fn deferred(request: &Request<'_>) -> bool {
    request.operation == "checkout"
        && request.options["pattern"]
            .as_str()
            .is_some_and(|pattern| {
                !pattern
                    .chars()
                    .all(|character| {
                        character.is_ascii_lowercase()
                            || character.is_ascii_digit()
                            || "_./-".contains(character)
                    })
            })
}

pub(super) fn select(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    request: &Request<'_>,
    mut prepared: Prepared<'_>,
) -> io::Result<(Vec<Value>, Vec<usize>, Option<Capture>)> {
    if !deferred(request) {
        return Ok((prepared.targets.to_vec(), Vec::new(), None));
    }
    let pattern = text(request.options.get("pattern"))?;
    let pool = pool(prepared.targets, request.to);
    let Selected {
        targets: selected,
        loads,
        proofs,
        capture: mut captured,
    } = if selection::stateful(pattern) {
        states(engine, root, home, &mut prepared, &pool, pattern)?
    } else {
        Selected {
            targets: glob(&pool, pattern)?,
            loads: Vec::new(),
            proofs: Vec::new(),
            capture: None,
        }
    };
    let identities = selected
        .iter()
        .map(|target| target["identity"].clone())
        .collect::<Vec<_>>();
    let result: Value = engine.request(&json!({"kind":"commandCheckoutSelect","token":prepared.token,"identities":identities,"readSet":proofs}))?;
    if result["token"] != prepared.token {
        return Err(decline("checkout selected owner token"));
    }
    if let Some(captured) = &mut captured {
        captured.captured.retain(|row| identities.contains(&row["identity"]));
    }
    Ok((array(result.get("targets"), "checkout selected targets")?.to_vec(), loads, captured))
}

fn pool(targets: &[Value], to: Option<&str>) -> Vec<Value> {
    targets
        .iter()
        .filter(|target| matches!(to, Some("head" | "reset")) || target["locallyRemoved"] != true)
        .cloned()
        .collect()
}

fn glob(targets: &[Value], pattern: &str) -> io::Result<Vec<Value>> {
    let identities = targets
        .iter()
        .map(|target| text(target.get("identity")))
        .collect::<io::Result<Vec<_>>>()?;
    let selected = patterns::extended::matching(&identities, &patterns::split(pattern))?;
    if selected.is_empty() {
        return Err(decline("checkout component pattern has no matches"));
    }
    Ok(targets
        .iter()
        .filter(|target| {
            target["identity"]
                .as_str()
                .is_some_and(|id| selected.contains(&id))
        })
        .cloned()
        .collect())
}

struct Selected {
    targets: Vec<Value>,
    loads: Vec<usize>,
    proofs: Vec<Value>,
    capture: Option<Capture>,
}

fn states(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    prepared: &mut Prepared<'_>,
    targets: &[Value],
    pattern: &str,
) -> io::Result<Selected> {
    let options = CaptureOptions {
        missing_status_invalid: true,
        allow_special_states: true,
        environments: prepared.environments.take(),
        ..CaptureOptions::default()
    };
    let capture = capture::capture_with(engine, root, home, prepared.context, targets, options)?;
    let result = evaluate_states(engine, root, prepared.context, targets, pattern, &capture);
    if result.is_err() {
        checkout_lifecycle::retain(prepared.startup.as_deref_mut(), &capture);
    }
    let mut selected = result?;
    selected.capture = Some(capture);
    Ok(selected)
}

fn evaluate_states(
    engine: &mut Engine,
    root: &Path,
    context: &Value,
    targets: &[Value],
    pattern: &str,
    capture: &Capture,
) -> io::Result<Selected> {
    let mut proofs = source_proofs(root, capture)?;
    let selected = selection::select_capture(engine, root, context, targets, pattern, capture)?;
    if proofs != source_proofs(root, capture)? {
        return Err(decline("checkout predicate source changed"));
    }
    proofs.extend(capture.dependency_read_set());
    Ok(Selected { targets: selected.0, loads: selected.1, proofs, capture: None })
}

fn source_proofs(root: &Path, capture: &Capture) -> io::Result<Vec<Value>> {
    capture.captured
        .iter()
        .flat_map(|component| {
            let directory = root.join(component["directory"].as_str().unwrap_or_default());
            component["files"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .map(move |file| directory.join(file))
        })
        .map(|path| read_proof(&path))
        .collect()
}
