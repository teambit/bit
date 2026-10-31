//! Bare-scope collection preserves full history; it never uses the workspace cache root set.
pub(super) mod files;

mod cross_device;
mod graph;
mod index;
mod repository;
mod verbose;

use super::{Options, io_error};
use crate::{
    commands::{
        color::Chalk,
        remote_action::startup,
        workspace_command::{self, format::Formatter, results::Report},
    },
    native::Outcome,
};
use bit_install::output::Output;
use repository::{Object, identity, text, unsupported};
use serde_json::{Value, json};
use std::{collections::BTreeMap, ffi::OsString, fs, io, path::Path};

struct Plan {
    logs: Vec<String>,
    deleted: Vec<String>,
    index: Option<Vec<u8>>,
}

pub(super) fn run(scope: &Path, args: &[OsString], options: &Options) -> io::Result<Outcome> {
    if cfg!(windows) {
        return Ok(Outcome::Declined(
            "bare collection Windows repository enumeration requires the published runtime".into(),
        ));
    }
    let plan = match prepare(scope, options) {
        Ok(plan) => plan,
        Err(error) => return Ok(Outcome::Declined(error.to_string())),
    };
    let chalk = Chalk::detect(args);
    let work = |output: &Output| {
        plan.execute(scope, options, chalk, output).map_err(|error| io_error::report(&error, chalk))
    };
    if options.json {
        workspace_command::execute_json_scope(scope, args, "gc", work)
    } else {
        workspace_command::execute_then_scope(scope, args, "gc", work)
    }
}
fn prepare(scope: &Path, options: &Options) -> io::Result<Plan> {
    if !startup::supported(None, scope, &Value::Null, false)? {
        return Err(unsupported("configured startup callbacks"));
    }
    let config: Value = bit_object_import::parse_jsonc(&fs::read(scope.join("scope.json"))?)?;
    let name = text(&config["name"])?;
    let objects = repository::read(&scope.join("objects"))?;
    let trash = repository::read(&scope.join("trash"))?;
    let mut collector = graph::Collector::new(scope, name, &objects, &trash);
    collector.verbose = options.verbose;
    let deleted = collector.plan()?;
    if options.verbose {
        verbose::preflight(&objects, &deleted)?;
    }
    files::validate_batch(&config, deleted.len())?;
    files::preflight_moves(scope, &deleted)?;
    let mut logs = inventory_report(name, &objects, &trash);
    logs.extend(collector.logs);
    logs.push(format!("[*] total {} refs to delete", deleted.len()));
    if options.verbose {
        logs.extend(verbose::deleted(&objects, &deleted)?);
    }
    let components = deleted
        .iter()
        .filter_map(|hash| {
            let object = objects.get(hash)?;
            (object.kind == "Component").then(|| identity(&object.value))
        })
        .collect::<io::Result<Vec<_>>>()?;
    logs.push(format!(
        "[*] total {} components to delete:\n{}\n",
        components.len(),
        components.join("\n"),
    ));
    let index = index::prepare(scope, &objects)?;
    Ok(Plan { logs, deleted, index })
}
fn inventory_report(
    name: &str,
    objects: &BTreeMap<String, Object>,
    trash: &BTreeMap<String, Object>,
) -> Vec<String> {
    let name = name.trim();
    let count = |kind| {
        objects
            .values()
            .filter(|object| object.kind == kind)
            .count()
    };
    let local = count_local_components(objects, name);
    let components = count("Component");
    let lanes = count("Lane");
    let trashed_lanes = trash
        .values()
        .filter(|object| object.kind == "Lane")
        .count();
    vec![
        format!("scope {name} has {} refs", objects.len()),
        format!(
            "total {} refs of ModelComponent, Lane and ScopeMeta",
            components + lanes + count("ScopeMeta"),
        ),
        format!("[*] total {local} refs of ModelComponent of this scope"),
        format!(
            "[*] total {} refs of ModelComponent of other scopes",
            components.saturating_sub(local),
        ),
        format!("[*] total {lanes} refs of Lane"),
        format!(
            "[*] total {} refs in the trash, total {trashed_lanes} lanes in the trash",
            trash.len(),
        ),
    ]
}
fn count_local_components(objects: &BTreeMap<String, Object>, name: &str) -> usize {
    objects
        .values()
        .filter(|object| {
            object.kind == "Component"
                && object.value["scope"]
                    .as_str()
                    .or_else(|| object.value["id"]["scope"].as_str())
                    .map(str::trim)
                    == Some(name)
        })
        .count()
}
impl Plan {
    fn execute(
        &self,
        scope: &Path,
        options: &Options,
        chalk: Chalk,
        output: &Output,
    ) -> io::Result<Report> {
        index::write(scope, self.index.as_deref())?;
        for message in &self.logs {
            output.console(message);
        }
        if !options.dry_run {
            files::move_batch(scope, &self.deleted)?;
            match fs::remove_file(scope.join("index.json")) {
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                result => result.map_err(|error| {
                    io_error::failure(error, "unlink", &scope.join("index.json"))
                })?,
            }
            output.console(&chalk.green(&format!(
                "[*] {} refs deleted successfully",
                self.deleted.len(),
            )));
        }
        let data = if options.json {
            serde_json::to_string_pretty(&json!({"completed":true}))?
        } else {
            Formatter::new(chalk).success_summary("garbage collection completed")
        };
        Ok(Report { data, code: 0, details: None })
    }
}
pub(super) fn restore(scope: &Path, args: &[OsString], options: &Options) -> io::Result<Outcome> {
    let index = match super::restore::preflight(scope).and_then(|()| restore_index(scope)) {
        Ok(index) => index,
        Err(error) => return Ok(Outcome::Declined(error.to_string())),
    };
    let work = |_: &Output| {
        index::write(scope, index.as_deref())?;
        super::restore::run(scope, options.restore_overwrite)
            .map_err(|error| error.report(Chalk::detect(args)))?;
        let data = if options.json {
            serde_json::to_string_pretty(&json!({"restored":true}))?
        } else {
            Formatter::new(Chalk::detect(args))
                .success_summary("restored the objects from the backup directory")
        };
        Ok(Report { data, code: 0, details: None })
    };
    if options.json {
        workspace_command::execute_json_scope(scope, args, "gc", work)
    } else {
        workspace_command::execute_then_scope(scope, args, "gc", work)
    }
}

pub(super) fn restore_index(scope: &Path) -> io::Result<Option<Vec<u8>>> {
    if !startup::supported(None, scope, &Value::Null, false)? {
        return Err(unsupported("configured startup callbacks"));
    }
    if cfg!(windows) || index::existing(scope)? {
        return Ok(None);
    }
    index::prepare(scope, &repository::read(&scope.join("objects"))?)
}
