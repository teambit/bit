//! Native stash orchestration; detached objects precede reset and new-component removal.
mod options;

use super::{
    Command,
    color::Chalk,
    status::{
        autosync::Startup,
        js::{array, decline, text},
    },
    workspace_command::{self, Request, format::Formatter, results::Report, stash::Save},
};
use crate::{native::Outcome, workspace};
use bit_object_import::{
    component_remove::NewBatch,
    stash_store::{self, PreparedLoad},
};
use options::Options;
use serde_json::{Value, json};
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "stash", aliases: &[], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("stash arguments are not UTF-8".to_owned()));
    };
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native stash grammar".to_owned()));
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return run_without_workspace(&cwd, args, &options);
    };
    let command = match &options {
        Options::Save { .. } => "save",
        Options::List => "list",
        Options::Unrecognized(_) => "stash",
        _ => "load",
    };
    let mut startup = Startup::default();
    let prepared = prepare(&root, options, &mut startup);
    let prepared = match prepared {
        Ok(prepared) => prepared,
        Err(error) if startup.committed || super::engine::is_canonical(&error) => {
            return failure(&root, args, command, &startup, error);
        }
        Err(error) => return Ok(Outcome::Declined(format!("stash: {error}"))),
    };
    workspace_command::checkout_lifecycle::before(&startup)?;
    workspace_command::execute_then(&root, args, command, |output| {
        workspace_command::checkout_lifecycle::loaded(&startup);
        execute(&root, args, prepared, output)
    })
}

enum Prepared {
    Save(Box<Save>),
    List(Vec<Value>),
    Load {
        metadata: Box<PreparedLoad>,
        planned: Box<workspace_command::Planned>,
        tracked: Option<Value>,
        count: usize,
    },
    Unrecognized(String),
    Error(String),
}

fn prepare(root: &Path, options: Options, startup: &mut Startup) -> io::Result<Prepared> {
    match options {
        Options::Save { include_new, message } => {
            Save::prepare(root, include_new, message.as_deref(), startup)
                .map(|save| Prepared::Save(Box::new(save)))
        }
        Options::List => {
            super::status::environments::quick(root, &workspace_command::home(), startup)?;
            stash_store::list(&bit_install::config::scope_path(root)).map(Prepared::List)
        }
        Options::Unrecognized(sub) => {
            super::status::environments::quick(root, &workspace_command::home(), startup)?;
            Ok(Prepared::Unrecognized(sub))
        }
        Options::Error(error) => {
            super::status::environments::quick(root, &workspace_command::home(), startup)?;
            Ok(Prepared::Error(error))
        }
        Options::Load { id, checkout } => prepare_load(root, id.as_deref(), checkout, startup),
    }
}

fn load_options(rows: &[Value]) -> io::Result<Value> {
    let mut versions = Vec::new();
    let mut entries = Vec::new();
    for row in rows {
        let id = &row["id"];
        let name = text(id.get("name"))?;
        let scope = id["scope"]
            .as_str()
            .filter(|value| !value.is_empty());
        let identity = scope.map_or_else(|| name.to_owned(), |scope| format!("{scope}/{name}"));
        let hash = text(row.get("hash"))?;
        if row["isNew"] == true {
            let mut entry = row["bitmapEntry"].clone();
            if !entry.is_object() {
                return Err(decline("stash bitmap entry"));
            }
            let mut id = id.clone();
            id["version"] = json!(hash);
            entry["id"] = id;
            entries.push(entry);
        } else {
            versions.push(json!({"identity":identity,"version":hash}));
        }
    }
    Ok(json!({"versions":versions,"bitmapEntries":entries}))
}

fn preflight_tracked(root: &Path, versions: &Value) -> io::Result<()> {
    let versions = array(Some(versions), "stash tracked versions")?;
    if versions.is_empty() {
        return Ok(());
    }
    let mut engine = super::engine::Engine::new()?;
    let context: Value = engine.request(&json!({"kind":"statusContext","root":root,"home":workspace_command::home(),"history":false}))?;
    let targets = array(context.get("targets"), "stash tracked targets")?;
    for version in versions {
        let target = targets
            .iter()
            .find(|target| target["identity"] == version["identity"])
            .ok_or_else(|| decline("stash tracked component requires canonical bitmap recovery"))?;
        let directory = text(target.get("directory"))?;
        if target["version"].as_str().is_none_or(str::is_empty) {
            return Err(decline("stash tracked component requires canonical version recovery"));
        }
        if !root.join(directory).is_dir() {
            return Err(decline("stash tracked component requires canonical path recovery"));
        }
    }
    Ok(())
}

fn execute(
    root: &Path,
    args: &[OsString],
    prepared: Prepared,
    output: &bit_install::output::Output,
) -> io::Result<Report> {
    let format = Formatter::new(Chalk::detect(args));
    let data = match prepared {
        Prepared::Error(error) => return Err(io::Error::other(error)),
        Prepared::Unrecognized(sub) => unrecognized_stash_report(args, &sub),
        Prepared::List(rows) => list_report(&rows)?,
        Prepared::Load { metadata, planned, tracked, count } => {
            apply_load(root, &metadata, *planned, tracked)?;
            format.success_summary(&format!(
                "checked out {count} components according to the latest stash",
            ))
        }
        Prepared::Save(save) => {
            let count = apply_save(root, *save, output)?;
            format.success_summary(&format!("stashed {count} components"))
        }
    };
    Ok(Report { data, code: 0, details: None })
}

fn unrecognized_stash_report(args: &[OsString], sub: &str) -> String {
    let format = Formatter::new(Chalk::detect(args));
    format!(
        r#"{} "{sub}" is not a subcommand of "stash", please run "bit stash --help" to list the subcommands"#,
        format.error_symbol(),
    )
}

fn run_without_workspace(cwd: &Path, args: &[OsString], options: &Options) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("not inside a workspace".to_owned()));
    }
    let (cmd, msg) = match options {
        Options::Unrecognized(sub) => {
            let report =
                Report { data: unrecognized_stash_report(args, sub), code: 0, details: None };
            return workspace_command::execute_with_scope(cwd, args, "stash", &report);
        }
        Options::Save { .. } => ("save", super::log::OUTSIDE_WORKSPACE_ERR),
        Options::Load { .. } => ("load", super::log::OUTSIDE_WORKSPACE_ERR),
        Options::Error(err) => ("load", err.as_str()),
        Options::List => ("list", "Cannot read properties of undefined (reading 'scope')"),
    };
    workspace_command::execute_failure_scope(cwd, args, cmd, false, "", io::Error::other(msg))
}

fn list_report(rows: &[Value]) -> io::Result<String> {
    rows.iter()
        .map(|row| {
            let id = text(row.get("id"))?;
            let count = array(row.get("components"), "stash list components")?.len();
            let message = row["message"]
                .as_str()
                .unwrap_or_else(|| if row["message"] == true { "true" } else { "" });
            Ok(format!("{id} ({count} components) {message}"))
        })
        .collect::<io::Result<Vec<_>>>()
        .map(|rows| rows.join("\n"))
}

fn apply_load(
    root: &Path,
    metadata: &PreparedLoad,
    mut planned: workspace_command::Planned,
    tracked: Option<Value>,
) -> io::Result<()> {
    metadata.validate()?;
    workspace_command::commit(&mut planned, root)?;
    if let Some(options) = tracked {
        let environment = planned.stash_added(root)?;
        let mut startup = Startup::default();
        let request = Request { operation: "checkout", options, to: None, verify_fresh: false };
        let mut tracked = workspace_command::plan_with(
            root,
            &request,
            false,
            false,
            Some(&mut startup),
            false,
            environment,
        )?;
        workspace_command::checkout_lifecycle::before(&startup)?;
        workspace_command::checkout_lifecycle::loaded(&startup);
        workspace_command::commit(&mut tracked, root)?;
    }
    super::status::cleanup_temporary(root)?;
    metadata.consume()
}

fn apply_save(
    root: &Path,
    mut save: Save,
    output: &bit_install::output::Output,
) -> io::Result<usize> {
    if save.loaded > 0 {
        output.status(&format!("loading {} component(s)", save.loaded));
    }
    if !save.modified.is_empty() || !save.new.is_empty() {
        output.status("importing missing dependencies...");
    }
    save.persist(root)?;
    reset(root, &mut save)?;
    if !save.new.is_empty() {
        let batch = NewBatch::prepare_with_components(root, &save.new, &save.removal_components())?;
        batch.commit(&workspace_command::file_id())?;
    }
    super::status::cleanup_temporary(root)?;
    Ok(save.modified.len() + save.new.len())
}

fn reset(root: &Path, save: &mut Save) -> io::Result<()> {
    if save.modified.is_empty() {
        return Ok(());
    }
    let request = Request {
        operation: "checkout",
        options: json!({"to":"reset","stash":{"resetIds":save.modified},"skipDependencyInstallation":true}),
        to: Some("reset"),
        verify_fresh: false,
    };
    let mut startup = Startup::default();
    let mut planned = workspace_command::plan_with(
        root,
        &request,
        false,
        false,
        Some(&mut startup),
        false,
        save.take_environment(),
    )?;
    workspace_command::checkout_lifecycle::before(&startup)?;
    workspace_command::checkout_lifecycle::loaded(&startup);
    workspace_command::commit(&mut planned, root)
}

fn prepare_load(
    root: &Path,
    id: Option<&str>,
    mut checkout: Value,
    startup: &mut Startup,
) -> io::Result<Prepared> {
    let metadata = match PreparedLoad::prepare(&bit_install::config::scope_path(root), id) {
        Ok(metadata) => metadata,
        Err(error) if error.to_string() == "no stashed components found" => {
            super::status::environments::quick(root, &workspace_command::home(), startup)?;
            return Ok(Prepared::Error(error.to_string()));
        }
        Err(error) => return Err(error),
    };
    let rows = array(metadata.data().get("stashCompsData"), "stash components")?;
    let count = rows.len();
    checkout["stash"] = load_options(rows)?;
    preflight_tracked(root, &checkout["stash"]["versions"])?;
    checkout["skipDependencyInstallation"] = json!(true);
    let tracked = checkout["stash"]["bitmapEntries"]
        .as_array()
        .is_some_and(|rows| !rows.is_empty())
        .then(|| {
            let mut tracked = checkout.clone();
            tracked["stash"]["bitmapEntries"] = json!([]);
            checkout["stash"]["versions"] = json!([]);
            tracked
        });
    let request =
        Request { operation: "checkout", options: checkout, to: None, verify_fresh: false };
    let planned = workspace_command::plan_with_startup(root, &request, startup)?;
    Ok(Prepared::Load { metadata: Box::new(metadata), planned: Box::new(planned), tracked, count })
}

fn failure(
    root: &Path,
    args: &[OsString],
    command: &str,
    startup: &Startup,
    error: io::Error,
) -> io::Result<Outcome> {
    if command != "save" {
        return workspace_command::checkout_lifecycle::failure(root, args, command, startup, error);
    }
    workspace_command::checkout_lifecycle::before(startup)?;
    let callback = error
        .get_ref()
        .and_then(|error| error.downcast_ref::<crate::host::callback_error::CallbackError>());
    if let Some(callback) = callback {
        print!("{}", callback.startup);
    }
    let failed = callback.map_or_else(String::new, |callback| callback.output.clone());
    workspace_command::execute_then(root, args, command, |output| {
        if let Some(progress) = startup.build_progress
            .as_ref()
            .map(|progress| &progress["stash"])
        {
            if let Some(count) = progress["loaded"]
                .as_u64()
                .filter(|count| *count > 0)
            {
                output.status(&format!("loading {count} component(s)"));
            }
            if progress["importing"] == true {
                output.status("importing missing dependencies...");
            }
        }
        workspace_command::checkout_lifecycle::loaded(startup);
        print!("{failed}");
        Err(error)
    })
}
