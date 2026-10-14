//! Native `bit switch <lane> -x` through the workspace
//! command's prepare, plan, capture and apply lifecycle.

mod options;
mod report;

use super::{
    status::js::{array, decline, text},
    workspace_command::{self, Planned, Request, progress::Progress, results::Report},
};
use crate::{commands::Command, native::Outcome, workspace};
use bit_install::output::Output;
use serde_json::Value;
use std::{env, ffi::OsString, io};

pub const COMMAND: Command = Command { name: "switch", aliases: &[], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native switch grammar".to_string()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    let prepared = match prepare(&root, args, &options) {
        Ok(prepared) => prepared,
        Err(error) => return Ok(Outcome::Declined(format!("switch: {error}"))),
    };
    let needs_checkout_progress = options.skip_fetch || !prepared.checkout_import_present();
    workspace_command::execute(
        &root,
        args,
        "switch",
        prepared.planned,
        &prepared.report,
        |output| {
            render_progress(
                output,
                &prepared.imports,
                needs_checkout_progress,
                prepared.import_count,
            );
        },
    )
}

fn render_progress(output: &Output, imports: &[RemoteImport], checkout: bool, count: u64) {
    for import in imports {
        if import.requested > 0 {
            import.render(output);
        }
    }
    if checkout {
        render_import(output, count);
    }
}

struct PreparedSwitch {
    planned: Planned,
    report: Report,
    import_count: u64,
    imports: Vec<RemoteImport>,
}

impl PreparedSwitch {
    fn checkout_import_present(&self) -> bool {
        self.imports
            .last()
            .is_some_and(|import| import.requested > 0 && import.reason.is_none())
    }
}

fn prepare(
    root: &std::path::Path,
    args: &[OsString],
    options: &options::Options,
) -> io::Result<PreparedSwitch> {
    let request =
        Request { operation: "switch", options: options.request(), to: None, verify_fresh: false };
    let planned = workspace_command::plan(root, &request)?;
    let chalk = super::color::Chalk::detect(args);
    let report = report::format(&planned.plan["result"], options, chalk)?;
    let import_count = planned.plan["switchImportCount"]
        .as_u64()
        .filter(|count| *count <= 4096)
        .ok_or_else(|| io::Error::other("native switch import progress receipt"))?;
    let mut imports =
        if options.skip_fetch { Vec::new() } else { remote_imports(planned.plan.get("progress"))? };
    if imports.iter().any(|import| import.reason.is_some())
        && let Some(checkout) = imports.last_mut()
        && checkout.reason.is_none()
        && checkout.requested > 0
    {
        checkout.requested =
            usize::try_from(import_count).map_err(|_| decline("switch fetched checkout count"))?;
        checkout.components = import_count;
        checkout.objects = 0;
    }
    Ok(PreparedSwitch { planned, report, import_count, imports })
}

struct RemoteImport {
    requested: usize,
    components: u64,
    objects: u64,
    reason: Option<String>,
}

fn remote_imports(value: Option<&Value>) -> io::Result<Vec<RemoteImport>> {
    Progress::parse(value)?.ok_or_else(|| decline("native switch remote progress receipt"))?;
    let rows = array(value.and_then(|value| value.get("imports")), "switch remote imports")?;
    if rows.len() > 4 {
        return Err(decline("native switch remote imports"));
    }
    rows.iter()
        .map(RemoteImport::parse)
        .collect()
}

impl RemoteImport {
    fn parse(value: &Value) -> io::Result<Self> {
        let ids = array(value.get("ids"), "switch import ids")?;
        let requested = ids.len();
        let components = value
            .get("components")
            .and_then(Value::as_u64)
            .ok_or_else(|| decline("switch import components"))?;
        let objects = value
            .get("objects")
            .and_then(Value::as_u64)
            .ok_or_else(|| decline("switch import objects"))?;
        let reason = match value.get("reason") {
            Some(Value::Null) => None,
            other => Some(text(other)?.to_string()),
        };
        if reason
            .as_deref()
            .is_some_and(|reason| !reason.starts_with("for fetching lane "))
        {
            return Err(decline("native switch remote import reason"));
        }
        Ok(Self { requested, components, objects, reason })
    }

    fn render(&self, output: &Output) {
        let suffix = self.reason
            .as_ref()
            .map_or_else(String::new, |reason| format!(" {reason}"));
        output.restart(&format!("importing {} components{suffix}", self.requested));
        let (count, kind) = if self.components > 0 {
            (self.components, "components")
        } else {
            (self.objects, "objects")
        };
        output.restart(&format!("successfully imported {count} {kind}{suffix}"));
    }
}

fn render_import(output: &Output, count: u64) {
    output.restart(&format!("importing {count} components"));
    output.restart(&format!("successfully imported {count} components"));
}
