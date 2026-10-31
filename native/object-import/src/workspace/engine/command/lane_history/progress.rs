//! Preserve an actual started import when validation fails before its success receipt.
#[cfg(test)]
mod tests;
use super::phase;
use crate::{
    command_import,
    workspace::engine::{command::Record, response},
};
use serde_json::{Value, json};
use std::io;

pub(in crate::workspace::engine::command) fn import(
    record: &mut Record,
    targets: &[command_import::Target],
) -> io::Result<()> {
    let ids = targets
        .iter()
        .map(|target| {
            let name = target.name.trim();
            let identity = target.scope
                .as_deref()
                .map(str::trim)
                .filter(|scope| !scope.is_empty())
                .map_or_else(|| name.to_owned(), |scope| format!("{scope}/{name}"));
            format!("{identity}@{}", target.version.trim())
        })
        .collect::<Vec<_>>();
    record.context["historyCheckoutImport"] = json!({"requested":targets.len(),"ids":ids,"performed":!targets.is_empty(),"completed":false});
    record.context["historyImportProgressStart"] =
        json!(record.repository.progress()["imports"].as_array().map_or(0, Vec::len));
    record.repository.prepare_versions(targets)?;
    record.context["historyCheckoutImport"]["completed"] = json!(true);
    Ok(())
}
pub(in crate::workspace::engine::command) fn failure(
    error: io::Error,
    record: &Record,
) -> io::Error {
    if phase(&record.request.options).is_none() {
        return error;
    }
    let mut progress = record.repository.progress();
    discard_incomplete(&mut progress, &record.context);
    if let Some(imported) = record.context.get("historyCheckoutImport") {
        progress["historyCheckoutImport"] = imported.clone();
    }
    let error = if response::is_canonical(&error) {
        error
    } else {
        response::canonical(
            command_import::remote_inflate_message(&error).unwrap_or_else(|| error.to_string()),
        )
    };
    response::with_progress(error, progress)
}

fn discard_incomplete(progress: &mut Value, context: &Value) {
    if context["historyCheckoutImport"]["completed"] != false {
        return;
    }
    let Some(index) = context["historyImportProgressStart"]
        .as_u64()
        .and_then(|index| usize::try_from(index).ok())
    else {
        return;
    };
    if let Some(rows) = progress["imports"].as_array_mut()
        && index < rows.len()
    {
        rows.remove(index);
    }
}
