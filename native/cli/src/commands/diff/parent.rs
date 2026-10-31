//! Compare stored Versions against the nearest meaningful first-parent ancestor.

use super::{Capture, Chalk, Engine, array, comparison, decline, one, rows, text};
use serde_json::{Value, json};
use std::{io, path::Path};

pub(super) struct Request<'a> {
    pub engine: &'a mut Engine,
    pub root: &'a Path,
    pub context: &'a Value,
    pub capture: &'a Capture,
    pub selected: &'a [Value],
    pub pattern: Option<&'a str>,
    pub requested_version: Option<&'a str>,
    pub chalk: Chalk,
}

pub(super) fn read(request: Request<'_>) -> io::Result<Vec<Value>> {
    let engine = request.engine;
    let identities = selected_identities(
        engine,
        request.root,
        request.selected,
        request.capture,
        request.pattern,
    )?;
    identities
        .iter()
        .map(|target| {
            let identity = text(
                target
                    .get("identity")
                    .or_else(|| target.get("id")),
            )?;
            let target_version = request.requested_version
                .or_else(|| target["version"].as_str())
                .or_else(|| target["head"].as_str())
                .map(str::trim)
                .filter(|ver| !ver.is_empty())
                .ok_or_else(|| decline("parent diff target has no version"))?;
            one_parent(
                engine,
                request.root,
                request.context,
                request.capture,
                identity,
                target_version,
                request.chalk,
            )
        })
        .collect()
}

fn selected_identities(
    engine: &mut Engine,
    root: &Path,
    selected: &[Value],
    capture: &Capture,
    pattern: Option<&str>,
) -> io::Result<Vec<Value>> {
    if pattern.is_some() {
        return Ok(selected.to_vec());
    }
    let result = comparison(engine, root, None, selected, capture, None, None)?;
    rows(&result, false)?
        .iter()
        .map(|row| {
            let identity = text(row.get("identity"))?;
            selected
                .iter()
                .find(|target| target["identity"] == identity)
                .cloned()
                .ok_or_else(|| decline("parent diff target absent"))
        })
        .collect()
}

fn one_parent(
    engine: &mut Engine,
    root: &Path,
    context: &Value,
    capture: &Capture,
    identity: &str,
    version: &str,
    chalk: Chalk,
) -> io::Result<Value> {
    let token = super::import_token(capture);
    let chain: Value = engine.request(&json!({
        "kind":"versionParentChain","root":root,"identity":identity,"targetVersion":version,"importToken":token,
    }))?;
    for parent in array(chain.get("parents"), "parent chain")? {
        if parent["hidden"] == true {
            continue;
        }
        let label = parent["tag"]
            .as_str()
            .or_else(|| parent["reference"].as_str())
            .map(str::trim)
            .filter(|label| !label.is_empty())
            .ok_or_else(|| decline("parent diff reference"))?;
        let row = compare(engine, root, identity, label, version, false, token)?;
        let rendered = one(context, capture, &row, chalk, Some(label), Some(version))?;
        if parent["tag"].is_string() || parent["sameFiles"] == false || rendered["hasDiff"] == true
        {
            return Ok(rendered);
        }
    }
    let row = compare(engine, root, identity, "no parent", version, true, token)?;
    one(context, capture, &row, chalk, Some("no parent"), Some(version))
}

fn compare(
    engine: &mut Engine,
    root: &Path,
    identity: &str,
    from: &str,
    to: &str,
    no_parent: bool,
    token: Option<&Value>,
) -> io::Result<Value> {
    engine.request(&json!({
        "kind":"versionDiff","root":root,"identity":identity,
        "fromVersion":from,"toVersion":to,"noParent":no_parent,"importToken":token,
        "gitExecutable":super::git::executable(root)?,"color":true,
    }))
}
