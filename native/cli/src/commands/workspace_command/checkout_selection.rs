//! Resolve checkout predicates against the prepared workspace before capturing selected targets.
//!
//! [`Prepared`] coordinates [`Engine`], [`Startup`] autosync, [`Capture`], and [`Environments`] for [`Request`].
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

/// Borrowed preparation state for deferred checkout/merge target capture.
pub(super) struct Prepared<'a> {
    pub token: &'a str,
    pub context: &'a Value,
    pub targets: &'a [Value],
    pub environments: &'a mut Option<Environments>,
    pub startup: Option<&'a mut Startup>,
}

/// Returns `true` when `request` uses a pattern or flag requiring deferred target selection after preparation.
#[inline]
pub(super) fn deferred(request: &Request<'_>) -> bool {
    matches!(request.operation, "checkout" | "merge")
        && request.options.get("lane").is_none()
        && request.options["pattern"]
            .as_str()
            .map(str::trim)
            .filter(|pattern| !pattern.is_empty())
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

/// Resolves deferred glob or stateful checkout/merge targets and captures their workspace state.
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
    let pool = pool(prepared.targets, request.to, request.operation);
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
    let identities = selected_identities(&selected);
    let result: Value = engine.request(&json!({"kind":"commandCheckoutSelect","token":prepared.token,"identities":identities,"readSet":proofs}))?;
    if result["token"].as_str().map(str::trim) != Some(prepared.token.trim()) {
        return Err(decline("checkout selected owner token"));
    }
    if let Some(captured) = &mut captured {
        captured.captured.retain(|row| {
            row.get("identity")
                .or_else(|| row.get("id"))
                .is_some_and(|identity| identities.contains(identity))
        });
    }
    Ok((array(result.get("targets"), "checkout selected targets")?.to_vec(), loads, captured))
}

/// Extracts non-empty `"identity"` or `"id"` values from `selected` target rows.
#[inline]
fn selected_identities(selected: &[Value]) -> Vec<Value> {
    selected
        .iter()
        .filter_map(|target| {
            target
                .get("identity")
                .or_else(|| target.get("id"))
                .filter(|id| {
                    !id.is_null()
                        && id
                            .as_str()
                            .is_none_or(|text| !text.trim().is_empty())
                })
                .cloned()
        })
        .collect()
}

#[inline]
fn pool(targets: &[Value], to: Option<&str>, operation: &str) -> Vec<Value> {
    targets
        .iter()
        .filter(|target| {
            operation == "merge"
                || matches!(to, Some("head" | "reset"))
                || target["locallyRemoved"] != true
        })
        .cloned()
        .collect()
}

fn glob(targets: &[Value], pattern: &str) -> io::Result<Vec<Value>> {
    let identities = targets
        .iter()
        .map(|target| {
            text(
                target
                    .get("identity")
                    .or_else(|| target.get("id")),
            )
        })
        .collect::<io::Result<Vec<_>>>()?;
    let selected: std::collections::HashSet<&str> =
        patterns::extended::matching(&identities, &patterns::split(pattern))?.into_iter().collect();
    if selected.is_empty() {
        return Err(decline("checkout component pattern has no matches"));
    }
    Ok(targets
        .iter()
        .zip(&identities)
        .filter(|(_, id)| selected.contains(*id))
        .map(|(target, _)| target.clone())
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
            let dir = [component["directory"].as_str(), component["rootDir"].as_str()]
                .into_iter()
                .flatten()
                .map(str::trim)
                .find(|val| !val.is_empty())
                .unwrap_or("");
            let directory = root.join(dir);
            component["files"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|file| {
                    [file.as_str(), file["relativePath"].as_str(), file["path"].as_str()]
                        .into_iter()
                        .flatten()
                        .map(str::trim)
                        .find(|path| !path.is_empty())
                })
                .map(move |file| directory.join(file))
        })
        .map(|path| read_proof(&path))
        .collect()
}
