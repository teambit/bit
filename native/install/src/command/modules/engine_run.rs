//! One engine run with the progress lines `DependencyInstaller.installComponents`
//! prints, and the `enrichUnpublishedSnapDepError` error rewrite.

use super::super::{
    calculate::Calculated,
    session::{Loaded, Session},
};
use crate::{
    engine::{self, EngineError, EngineInstallOptions, EngineResult, OutputSink, RestoreInput},
    output::{Output, Style},
};
use indexmap::IndexMap;
use std::{io, time::Instant};

const DEDUPING: &str = "deduping dependencies for installation";
const PRE_SUBSCRIBERS: &str = "running pre install subscribers";
const RUNNING: &str = "running package installation using pnpm";
const POST_SUBSCRIBERS: &str = "running post install subscribers";
/// Codes an unpublished snap dependency can surface as.
const NO_MATCHING_VERSION: [&str; 3] = [
    "ERR_PNPM_NO_MATCHING_VERSION",
    "SPEC_NOT_SUPPORTED_BY_ANY_RESOLVER",
    "ERR_PNPM_SPEC_NOT_SUPPORTED_BY_ANY_RESOLVER",
];

/// Run the engine on the calculated projects.
pub async fn run(
    session: &Session<'_>,
    loaded: &Loaded,
    calculated: &Calculated,
    restore: Option<&RestoreInput>,
) -> io::Result<EngineResult> {
    let output = &session.output;
    output.status(DEDUPING);
    output.success(DEDUPING, None);
    output.status(PRE_SUBSCRIBERS);
    output.success(PRE_SUBSCRIBERS, None);
    output.status(RUNNING);
    output.stop();
    let started = Instant::now();
    let options = EngineInstallOptions {
        update_all: session.options.update,
        lockfile_only: session.options.lockfile_only,
        include_optional_deps: !session.options.no_optional,
        restore: restore.cloned(),
        output: Some(OutputSink(output.sink())),
    };
    let result = engine::install(&calculated.outcome.plan, &loaded.engine, &options)
        .await
        .map_err(|error| enrich(error, calculated, output))?;
    output.success(&format!("done {RUNNING}"), Some(started));
    output.status(POST_SUBSCRIBERS);
    output.success(POST_SUBSCRIBERS, None);
    Ok(result)
}

/// A dependency pinned to a never-published snap: point at `bit import` instead of
/// the package manager's "No matching version found".
fn enrich(error: io::Error, calculated: &Calculated, output: &Output) -> io::Error {
    let (code, message) = match EngineError::from_io(&error) {
        Some(engine_error) => (engine_error.code.clone(), engine_error.message.clone()),
        None => (None, error.to_string()),
    };
    let candidate = code
        .as_deref()
        .map_or_else(
            || message.contains("No matching version found"),
            |code| NO_MATCHING_VERSION.contains(&code),
        );
    if !candidate {
        return error;
    }
    let unpublished = unpublished(calculated, &message);
    if unpublished.is_empty() {
        return error;
    }
    io::Error::other(unpublished_message(&unpublished, output))
}

/// Snap-pinned dependencies outside the workspace whose hash the error mentions.
fn unpublished(calculated: &Calculated, message: &str) -> IndexMap<String, (String, Vec<String>)> {
    let local: Vec<String> = calculated.components
        .iter()
        .map(|component| component.id.to_string_without_version())
        .collect();
    let mut found: IndexMap<String, (String, Vec<String>)> = IndexMap::new();
    for (dependent, dependencies) in &calculated.dependencies {
        for dependency in &dependencies.components {
            let Some(version) = dependency.id.version.as_deref().filter(|version| is_snap(version))
            else {
                continue;
            };
            let id = dependency.id.to_string_without_version();
            if local.contains(&id) || !message.contains(version) {
                continue;
            }
            let entry = found
                .entry(id)
                .or_insert_with(|| (version.to_string(), Vec::new()));
            entry.1.push(dependent.clone());
        }
    }
    found
}

fn is_snap(version: &str) -> bool {
    version.len() == 40 && version.bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// `UnpublishedComponentDependency`.
fn unpublished_message(
    unpublished: &IndexMap<String, (String, Vec<String>)>,
    output: &Output,
) -> String {
    let symbol = output.paint(Style::Red, "\u{2716}");
    let list: Vec<String> = unpublished
        .iter()
        .map(|(id, (version, dependents))| {
            format!("   {symbol} {id} ({}) required by: {}", &version[..9], dependents.join(", "))
        })
        .collect();
    let ids: Vec<&str> = unpublished
        .keys()
        .map(String::as_str)
        .collect();
    format!(
        "unable to install the following component(s) — they're not checked out in your workspace and are pinned to a snap that was never published to the registry, so there's no package to fetch and no source to link:\n\n{}\n\nthis usually means the component's build failed or hasn't completed yet.\nto resolve, import it into your workspace so it's linked from source instead of fetched from the registry:\n\n  bit import {}",
        list.join("\n"),
        ids.join(" "),
    )
}
