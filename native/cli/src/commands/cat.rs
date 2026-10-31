//! `CatCmd`: inspect validated stored Sources without returning file bodies through Node.

mod options;
mod report;

use self::options::{Options, parse};
use super::{
    Command,
    add::docs,
    engine::Engine,
    list::bitmap,
    status::{environments::Environments, js::decline},
    workspace_command,
};
use crate::{
    discovery::{self, Target},
    history::History,
    host::Host,
    native::Outcome,
    workspace,
};
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "cat", aliases: &[], run };

const FILE_WITH_CONFIG_ERR: &str =
    "--file cannot be used with --config. use --all to show both files and config";
const NO_HOST_ERR: &str =
    "unable to find a component host. please run this command from within a Bit workspace or scope";

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(arguments) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("outside native cat grammar".into()));
    };
    let Some(options) = parse(&arguments[1..]) else {
        return Ok(Outcome::Declined("outside native cat grammar".into()));
    };
    let cwd = env::current_dir()?;
    if options.file.is_some() && options.config && !options.all {
        return emit_file_with_config_error(&cwd, args, options.json);
    }
    let Some(root) = workspace::root(&cwd) else {
        return run_outside_workspace(&cwd, args, options.json);
    };
    let prepared = match prepare(&root, &options) {
        Ok(prepared) => prepared,
        Err(Failure::Declined(error)) => return Ok(Outcome::Declined(format!("cat: {error}"))),
        Err(Failure::Committed(error, output)) => {
            History::start(&root, args).end(false);
            io::stdout().write_all(output.as_bytes())?;
            return Err(error);
        }
    };
    present(&root, args, &options, prepared)
}

fn emit_file_with_config_error(cwd: &Path, args: &[OsString], json: bool) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("published cat option error".into()));
    }
    if let Some(root) = workspace::root(cwd) {
        if json {
            return workspace_command::execute_json(&root, args, "cat", |_| {
                Err(io::Error::other(FILE_WITH_CONFIG_ERR))
            });
        }
        return workspace_command::execute_then(&root, args, "cat", |_| {
            Err(io::Error::other(FILE_WITH_CONFIG_ERR))
        });
    }
    workspace_command::execute_failure_scope(
        cwd,
        args,
        "cat",
        json,
        "",
        io::Error::other(FILE_WITH_CONFIG_ERR),
    )
}

fn run_outside_workspace(cwd: &Path, args: &[OsString], json: bool) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty())
        || cwd
            .ancestors()
            .any(|dir| {
                dir.join("scope.json").is_file()
                    || dir.join(".bit").is_dir()
                    || dir.join(".git/bit").is_dir()
            })
    {
        return Ok(Outcome::Declined("cat requires a supported workspace".into()));
    }
    workspace_command::execute_failure_scope(
        cwd,
        args,
        "cat",
        json,
        "",
        io::Error::other(NO_HOST_ERR),
    )
}

fn present(
    root: &Path,
    args: &[OsString],
    options: &Options<'_>,
    mut prepared: Prepared,
) -> io::Result<Outcome> {
    let rendered = match report::render(&prepared.value, options) {
        Ok(rendered) => rendered,
        Err(error) if prepared.metadata || prepared.committed => {
            History::start(root, args).end(false);
            return Err(error);
        }
        Err(error) => return Ok(Outcome::Declined(format!("cat: {error}"))),
    };
    io::stdout().write_all(prepared.output.as_bytes())?;
    if !options.json {
        let report = workspace_command::results::Report { data: rendered, code: 0, details: None };
        return workspace_command::execute_with(root, args, "cat", &report, |_| {
            prepared.docs
                .take()
                .map_or(Ok(()), docs::CatDocs::publish)
        });
    }
    json_output(root, args, &rendered, prepared.docs.take())
}

fn json_output(
    root: &Path,
    args: &[OsString],
    rendered: &str,
    cache: Option<docs::CatDocs>,
) -> io::Result<Outcome> {
    let history = History::start(root, args);
    let result = (|| {
        if let Some(cache) = cache {
            cache.publish()?;
        }
        let mut stdout = io::stdout().lock();
        stdout.write_all(rendered.as_bytes())?;
        stdout.flush()
    })();
    history.end(result.is_ok());
    result?;
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

struct Prepared {
    value: Value,
    output: String,
    metadata: bool,
    committed: bool,
    docs: Option<docs::CatDocs>,
}

enum Failure {
    Declined(io::Error),
    Committed(io::Error, String),
}

impl From<io::Error> for Failure {
    fn from(error: io::Error) -> Self {
        Self::Declined(error)
    }
}

#[derive(Default)]
struct Read {
    value: Value,
    docs: Option<docs::CatDocs>,
    output: String,
    committed: bool,
}

fn prepare(root: &Path, options: &Options<'_>) -> Result<Prepared, Failure> {
    let raw = options.id.ok_or_else(|| decline("cat identity"))?;
    let (requested, explicit) = raw
        .rsplit_once('@')
        .map_or((raw, None), |(id, version)| (id, Some(version)));
    if requested.trim().is_empty() || explicit.is_some_and(|ver| ver.trim().is_empty()) {
        return Err(decline("cat identity or version").into());
    }
    let entry = selected_entry(root, requested)?;
    let mut engine = Engine::new()?;
    require_component(root, &entry, &mut engine)?;
    let current_version = explicit.is_none_or(|version| entry.version.as_deref() == Some(version));
    let mut source = if current_version {
        read_current(root, &entry, options)?
    } else {
        let ver = explicit.ok_or_else(|| decline("cat stored version"))?;
        Read { value: read_stored(root, &entry, ver, &mut engine)?, ..Default::default() }
    };
    source.value["id"] = json!(entry.identity);
    let metadata =
        options.config || options.all || (current_version && source.docs.is_none());
    if metadata {
        source.output =
            cat_metadata(root, raw, &mut source.value, current_version.then_some(&entry))?;
    }
    Ok(Prepared {
        value: source.value,
        output: source.output,
        metadata,
        committed: source.committed,
        docs: source.docs,
    })
}

fn read_current(
    root: &Path,
    entry: &bitmap::Entry,
    options: &Options<'_>,
) -> Result<Read, Failure> {
    let current = workspace_files(root, entry)?;
    if let Some(file) = options.file {
        report::select(&current.files, file)?;
    }
    let mut source = Read {
        value: json!({"version":entry.version.as_deref().unwrap_or("latest"),"files":current.files}),
        docs: if options.config || options.all {
            None
        } else {
            docs::cat_prepare(root, current.docs)
        },
        ..Default::default()
    };
    if let Some(plan) = source.docs.as_mut()
        && !plan.misses().is_empty()
    {
        if let Some(output) = parse_docs(root, plan)? {
            source.committed = true;
            source.output = output;
        } else {
            source.docs = None;
        }
    }
    Ok(source)
}

fn parse_docs(root: &Path, plan: &mut docs::CatDocs) -> Result<Option<String>, Failure> {
    let Target::Entry(cli) = discovery::find()? else {
        return Err(Failure::Declined(decline("published cat semantic parser unavailable")));
    };
    let host = Host::new(cli, root.to_owned(), false);
    let supported = host
        .call("catSemanticDocsSupport", &json!({}))
        .and_then(|value| serde_json::from_value::<bool>(value).map_err(io::Error::other))
        .map_err(|error| Failure::Committed(error, host.take_stdout()))?;
    if !supported {
        return Ok(None);
    }
    let writes = host
        .call(
            "catSemanticDocs",
            &json!({
                "components":plan.components(),
                "scopePath":bit_object_import::scope_path(root),
            }),
        )
        .map_err(|error| Failure::Committed(error, host.take_stdout()))?;
    if let Some(error) =
        plan.absorb(&writes).map_err(|error| Failure::Committed(error, host.take_stdout()))?
    {
        return Err(Failure::Committed(io::Error::other(error), host.take_stdout()));
    }
    Ok(Some(host.take_stdout()))
}

fn read_stored(
    root: &Path,
    entry: &bitmap::Entry,
    version: &str,
    engine: &mut Engine,
) -> io::Result<Value> {
    engine.request(&json!({
        "kind":"componentCat", "root":root,
        "storedIdentity":entry.identity, "version":version,
    }))
}

fn selected_entry(root: &Path, requested: &str) -> io::Result<bitmap::Entry> {
    let mut matches = bitmap::read(root)?.entries
        .into_iter()
        .filter(|entry| {
            entry.identity == requested
                || entry.identity
                    .split_once('/')
                    .is_some_and(|(_, name)| name == requested)
        });
    let entry = matches.next().ok_or_else(|| decline("cat identity absent"))?;
    if matches.next().is_some() {
        return Err(decline("cat identity ambiguous"));
    }
    Ok(entry)
}

fn require_component(root: &Path, entry: &bitmap::Entry, engine: &mut Engine) -> io::Result<()> {
    let context: Value = engine.request(&json!({
        "kind":"statusContext", "root":root, "home":workspace_command::home(), "history":false,
    }))?;
    let target = context["targets"]
        .as_array()
        .and_then(|targets| {
            targets
                .iter()
                .find(|target| target["identity"] == entry.identity)
        })
        .ok_or_else(|| decline("cat current component context"))?;
    Environments::require_native_write_for(root, &context, std::slice::from_ref(target))
}

fn cat_metadata(
    root: &Path,
    id: &str,
    value: &mut Value,
    current: Option<&bitmap::Entry>,
) -> Result<String, Failure> {
    let Target::Entry(cli) = discovery::find()? else {
        return Err(Failure::Declined(decline("published CatCmd host unavailable")));
    };
    let host = Host::new(cli, root.to_owned(), false);
    let supported: bool = host
        .call("catSupport", &json!({}))
        .and_then(|value| serde_json::from_value(value).map_err(io::Error::other))?;
    if !supported {
        return Err(Failure::Declined(decline("published CatCmd metadata unavailable")));
    }
    let metadata: Value = host
        .call("catMetadata", &json!({"id":id}))
        .map_err(|error| Failure::Committed(error, host.take_stdout()))?;
    value["id"] = metadata["id"].clone();
    value["version"] = metadata["version"].clone();
    value["config"] = metadata["config"].clone();
    if let Some(entry) = current {
        let refreshed = workspace_files(root, entry)
            .map_err(|error| Failure::Committed(error, host.take_stdout()))?;
        if value["files"] != json!(refreshed.files) {
            return Err(Failure::Committed(
                io::Error::other("cat workspace sources changed during metadata capture"),
                host.take_stdout(),
            ));
        }
    }
    Ok(host.take_stdout())
}

struct WorkspaceFiles {
    files: Vec<Value>,
    docs: Value,
}

fn workspace_files(root: &Path, entry: &bitmap::Entry) -> io::Result<WorkspaceFiles> {
    if !report::safe_relative(&entry.root_dir) {
        return Err(decline("cat workspace root path"));
    }
    let config = bit_install::config::WorkspaceConfig::load(root)?;
    let core: Vec<String> = serde_json::from_str(include_str!(
        "../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))?;
    let workspace = bit_install::workspace::Workspace::load(root, &config, &core)?;
    let (component, bitmap_entry) = workspace.components
        .iter()
        .zip(&workspace.entries)
        .find(|(component, _)| component.id.to_string_without_version() == entry.identity)
        .ok_or_else(|| decline("cat workspace component absent"))?;
    if component.root_dir != entry.root_dir || !component.files.contains(&bitmap_entry.main_file) {
        return Err(decline("cat workspace directory changed"));
    }
    // Both Workspace::load and BitMap.trackDirectoryChanges rescan a component
    // with a rootDir; published getFilesByDir marks every scanned file test:false.
    let docs = json!({
        "directory":component.root_dir,
        "files":component.files.iter().map(|file| json!({
            "relativePath":file,
            "name":file.rsplit('/').next().unwrap_or(file),
            "test":false,
        })).collect::<Vec<_>>(),
    });
    Ok(WorkspaceFiles { files: report::source_files(&component.dir, &component.files)?, docs })
}
