//! The ordinary merge install follows native no-snap materialization.

use crate::{
    commands::{
        color::Chalk,
        installation::Installer,
        list::bitmap,
        status::js::{array, decline, text},
        workspace_command::{self, Planned, Request, progress::Progress, resolve, results::Report},
    },
    native::Outcome,
};
use bit_install::output::Output;
use serde_json::{Value, json};
use std::{ffi::OsString, io, path::Path};

use super::report;

pub(in crate::commands) fn start(
    root: &Path,
    argv: &[&str],
    skip: bool,
) -> io::Result<Option<Installer>> {
    if skip { Ok(None) } else { Installer::start(root, argv).map(Some) }
}

pub(in crate::commands) fn execute(
    root: &Path,
    args: &[OsString],
    planned: Planned,
    report: Report,
    progress: Option<&Progress>,
    installer: Option<Installer>,
) -> io::Result<Outcome> {
    let Some(installer) = installer else {
        return workspace_command::execute(root, args, "merge", planned, &report, |output| {
            render_progress(output, progress);
        });
    };
    let result = &planned.plan["result"];
    if planned.plan.get("needsSnap").is_some() || result["mergeSnapResults"].is_object() {
        return Ok(Outcome::Declined("merge installation precedes snapping".to_string()));
    }
    let conflicts = result["leftUnresolvedConflicts"] == true;
    workspace_command::execute_then(root, args, "merge", |output| {
        render_progress(output, progress);
        let mut planned = planned;
        workspace_command::commit(&mut planned, root)?;
        if !conflicts && let Err(error) = installer.install_merge(root) {
            output.failure(&format!(
                "failed installing packages, see the log for full stacktrace. error: {error}",
            ));
        }
        Ok(report)
    })
}

fn render_progress(output: &Output, progress: Option<&Progress>) {
    if let Some(progress) = progress {
        progress.render_merge(output);
    }
}

/// Node installs merged files before `snapForMerge`. A no-snap merge followed
/// by the native resolve path retains that ordering within one CLI command.
pub(in crate::commands) struct Snapping<'a> {
    pub options: Value,
    pub message: Option<&'a str>,
    pub mode: report::Mode,
    pub planned: &'a Planned,
    pub progress: Option<&'a Progress>,
    pub installer: Option<Installer>,
    pub materialized: Option<Planned>,
}

#[cfg_attr(
    dylint_lib = "perfectionist",
    expect(
        perfectionist::overly_long_function,
        perfectionist::too_many_local_bindings,
        reason = "Existing CLI orchestration is retained until its operation is decomposed"
    )
)]
pub(in crate::commands) fn execute_snapping(
    root: &Path,
    args: &[OsString],
    snapping: Snapping<'_>,
) -> io::Result<Outcome> {
    let Snapping {
        options,
        message,
        mode,
        planned,
        progress,
        installer,
        materialized,
    } = snapping;
    let Some(installer) = installer else { return Err(decline("merge snap installer")) };
    let (expected, mut materialized) =
        match prepare_snapping(root, args, options, mode, planned, materialized) {
            Ok(prepared) => prepared,
            Err(error) => {
                return Ok(Outcome::Declined(format!("merge before installation: {error}")));
            }
        };
    workspace_command::execute_then(root, args, "merge", |output| {
        render_progress(output, progress);
        workspace_command::commit(&mut materialized, root)?;
        if let Err(error) = installer.install_merge(root) {
            output.failure(&format!(
                "failed installing packages, see the log for full stacktrace. error: {error}",
            ));
        }
        let mut resolve = resolve::plan(
            root,
            &resolve::ResolveRequest {
                kind: resolve::Kind::Resolve,
                options: json!({ "message": message }),
                selection: resolve::Selection::Resolve { pattern: None },
            },
        )?;
        let resolved =
            array(resolve.plan["result"].get("resolvedComponents"), "resolved components")?
                .iter()
                .map(|row| text(row.get("id")).map(str::to_string))
                .collect::<io::Result<Vec<_>>>()?;
        if resolved != expected {
            return Err(decline("merge snap selection changed after installation"));
        }
        let auto_snapped =
            array(resolve.plan.get("autoSnappedResults"), "merge auto snaps")?.to_vec();
        workspace_command::commit(&mut resolve, root)?;
        let bitmap = bitmap::read(root)?;
        let snapped = expected
            .iter()
            .map(|identity| {
                let version = bitmap.entries
                    .iter()
                    .find(|entry| &entry.identity == identity)
                    .and_then(|entry| entry.version.as_deref())
                    .ok_or_else(|| decline("merge snap bitmap version"))?;
                Ok(json!({ "id": format!("{identity}@{version}") }))
            })
            .collect::<io::Result<Vec<Value>>>()?;
        let mut result = materialized.plan["result"].clone();
        result["mergeSnapResults"] = json!({
            "snappedComponents": snapped,
            "autoSnappedResults": auto_snapped,
        });
        report::format(&result, mode, Chalk::detect(args))
    })
}

/// Both plans must describe the same merge before any workspace write.
#[cfg_attr(
    dylint_lib = "perfectionist",
    expect(
        perfectionist::overly_long_function,
        reason = "Existing CLI orchestration is retained until its operation is decomposed"
    )
)]
fn prepare_snapping(
    root: &Path,
    args: &[OsString],
    mut options: Value,
    mode: report::Mode,
    planned: &Planned,
    materialized: Option<Planned>,
) -> io::Result<(Vec<String>, Planned)> {
    if bitmap::read(root)?.lane.is_some() != mode.lane {
        return Err(decline("install-before-snap lane state"));
    }
    let result = &planned.plan["result"];
    let expected = if let Some(identities) = planned.plan.get("needsSnap") {
        array(Some(identities), "merge snap identities")?
            .iter()
            .map(|identity| text(Some(identity)).map(str::to_string))
            .collect::<io::Result<Vec<_>>>()?
    } else {
        array(result["mergeSnapResults"].get("snappedComponents"), "merge snapped components")?
            .iter()
            .map(|row| {
                text(row.get("id"))?
                    .rsplit_once('@')
                    .map(|(identity, _)| identity.to_string())
                    .ok_or_else(|| decline("merge snap identity"))
            })
            .collect::<io::Result<Vec<_>>>()?
    };
    if expected.is_empty()
        || (result["mergeSnapResults"].is_object()
            && !array(result["mergeSnapResults"].get("autoSnappedResults"), "merge auto snaps")?
                .is_empty())
        || !array(result.get("removedComponents"), "merge removed components")?.is_empty()
    {
        return Err(decline("merge snap requires a single-stage merge"));
    }
    options["noSnap"] = json!(true);
    options
        .as_object_mut()
        .unwrap()
        .remove("message");
    let request = Request { operation: "merge", options, to: None, verify_fresh: true };
    let materialized = match materialized {
        Some(materialized) => materialized,
        None => workspace_command::plan(root, &request)?,
    };
    let mut before_snap = result.clone();
    before_snap
        .as_object_mut()
        .unwrap()
        .remove("mergeSnapResults");
    if materialized.plan["result"] != before_snap {
        return Err(decline("merge no-snap plan differs before installation"));
    }
    report::format(&materialized.plan["result"], mode, Chalk::detect(args))?;
    Ok((expected, materialized))
}
