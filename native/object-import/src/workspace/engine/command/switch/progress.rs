//! Checkout imports each selected status, including already cached or unchanged IDs.
use super::invalid;
use serde_json::{Value, json};
use std::{io, path::Path};

pub(in crate::workspace::engine::command) fn import_count(
    _root: &Path,
    context: &Value,
    targets: &[Value],
) -> io::Result<usize> {
    if let Some(count) = context["switchCheckoutImport"]["requested"].as_u64() {
        return usize::try_from(count).map_err(io::Error::other);
    }
    let additions = context["lane"]["addedTargets"]
        .as_array()
        .ok_or_else(|| invalid("switch addition count"))?
        .len();
    Ok(targets.len() + additions)
}

pub(in crate::workspace::engine::command) fn receipt(count: usize) -> Value {
    json!({"requested":count,"components":count,"objects":0,"performed":count > 0})
}

pub(in crate::workspace::engine::command) fn additions(
    context: &Value,
    targets: &mut Vec<crate::command_import::Target>,
) -> io::Result<()> {
    let added = context["lane"]["addedTargets"]
        .as_array()
        .ok_or_else(|| invalid("switch addition count"))?;
    for target in added {
        let identity =
            target["identity"].as_str().ok_or_else(|| invalid("switch addition identity"))?;
        let (scope, name) =
            identity.split_once('/').ok_or_else(|| invalid("switch addition scope"))?;
        let version =
            target["version"].as_str().ok_or_else(|| invalid("switch addition version"))?;
        targets.push(crate::command_import::Target {
            scope: Some(scope.into()),
            name: name.into(),
            version: version.into(),
        });
    }
    Ok(())
}

pub(in crate::workspace::engine::command) fn failure(
    error: io::Error,
    record: &super::Record,
) -> io::Error {
    if record.request.operation != super::super::input::Operation::Switch {
        return error;
    }
    let mut progress = record.repository.progress();
    if let Some(imported) = record.context.get("switchCheckoutImport") {
        progress["switchCheckoutImport"] = imported.clone();
    }
    super::super::super::response::with_progress(error, progress)
}
