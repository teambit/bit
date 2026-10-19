//! `CatCmd`: inspect validated stored Sources without returning file bodies through Node.

mod report;

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
    path::{Component, Path},
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "cat", aliases: &[], run };

#[derive(Default)]
struct Options<'a> {
    id: Option<&'a str>,
    file: Option<&'a str>,
    config: bool,
    all: bool,
    json: bool,
}

fn parse<'a>(args: &[&'a str]) -> Option<Options<'a>> {
    let mut options = Options::default();
    let mut index = 0;
    while let Some(arg) = args.get(index) {
        match *arg {
            "--file" | "-f" if options.file.is_none() => {
                index += 1;
                options.file = Some(
                    args.get(index)
                        .copied()
                        .filter(|file| !file.is_empty())?,
                );
            }
            "--config" | "-c" if !options.config => options.config = true,
            "--all" | "-a" if !options.all => options.all = true,
            "--json" | "-j" if !options.json => options.json = true,
            id if !id.starts_with('-') && options.id.is_none() => options.id = Some(id),
            _ => return None,
        }
        index += 1;
    }
    options.id.map(|_| options)
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let arguments = args
        .iter()
        .map(|arg| arg.to_str())
        .collect::<Option<Vec<_>>>();
    let Some(options) = arguments
        .as_deref()
        .and_then(|arguments| parse(&arguments[1..]))
    else {
        return Ok(Outcome::Declined("outside native cat grammar".into()));
    };
    if options.file.is_some() && options.config && !options.all {
        return Ok(Outcome::Declined("published cat option error".into()));
    }
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("cat requires a supported workspace".into()));
    };
    let prepared = match prepare(&root, &options) {
        Ok(prepared) => prepared,
        Err(Failure::Declined(error)) => return Ok(Outcome::Declined(format!("cat: {error}"))),
        Err(Failure::Committed(error, output)) => {
            io::stdout().write_all(output.as_bytes())?;
            return Err(error);
        }
    };
    present(&root, args, &options, prepared)
}

fn present(
    root: &Path,
    args: &[OsString],
    options: &Options<'_>,
    mut prepared: Prepared,
) -> io::Result<Outcome> {
    let rendered = match report::render(&prepared.value, options) {
        Ok(rendered) => rendered,
        Err(error) if prepared.metadata => return Err(error),
        Err(error) => return Ok(Outcome::Declined(format!("cat: {error}"))),
    };
    io::stdout().write_all(prepared.output.as_bytes())?;
    if !options.json {
        return workspace_command::execute_with(
            root,
            args,
            "cat",
            &workspace_command::results::Report { data: rendered, code: 0, details: None },
            |_| {
                prepared.docs
                    .take()
                    .map_or(Ok(()), docs::CacheOnly::publish)
            },
        );
    }
    json_output(root, args, &rendered, prepared.docs.take())
}

fn json_output(
    root: &Path,
    args: &[OsString],
    rendered: &str,
    cache: Option<docs::CacheOnly>,
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
    docs: Option<docs::CacheOnly>,
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

fn prepare(root: &Path, options: &Options<'_>) -> Result<Prepared, Failure> {
    let raw = options.id.ok_or_else(|| decline("cat identity"))?;
    let (requested, explicit) = raw
        .rsplit_once('@')
        .map_or((raw, None), |(id, version)| (id, Some(version)));
    if requested.is_empty() || explicit == Some("") {
        return Err(decline("cat identity or version").into());
    }
    let entry = selected_entry(root, requested)?;
    let mut engine = Engine::new()?;
    require_component(root, &entry, &mut engine)?;
    let current_version = explicit.is_none_or(|version| entry.version.as_deref() == Some(version));
    let (mut value, docs) = if current_version {
        read_current(root, &entry, options)?
    } else {
        let version = explicit.ok_or_else(|| decline("cat stored version"))?;
        (read_stored(root, &entry, version, &mut engine)?, None)
    };
    value["id"] = json!(entry.identity);
    let metadata = options.config || options.all || (current_version && docs.is_none());
    let output = if metadata { cat_metadata(root, raw, &mut value)? } else { String::new() };
    Ok(Prepared { value, output, metadata, docs })
}

fn read_current(
    root: &Path,
    entry: &bitmap::Entry,
    options: &Options<'_>,
) -> io::Result<(Value, Option<docs::CacheOnly>)> {
    let current = workspace_files(root, entry)?;
    let docs =
        if options.config || options.all { None } else { docs::cache_only(root, current.docs)? };
    Ok((
        json!({"version":entry.version.as_deref().unwrap_or("latest"),"files":current.files}),
        docs,
    ))
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

fn cat_metadata(root: &Path, id: &str, value: &mut Value) -> Result<String, Failure> {
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
    Ok(host.take_stdout())
}

struct WorkspaceFiles {
    files: Vec<Value>,
    docs: Value,
}

fn workspace_files(root: &Path, entry: &bitmap::Entry) -> io::Result<WorkspaceFiles> {
    if !safe_relative(&entry.root_dir) {
        return Err(decline("cat workspace root path"));
    }
    let config = bit_install::config::WorkspaceConfig::load(root)?;
    let core: Vec<String> = serde_json::from_str(include_str!(
        "../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))?;
    let workspace = bit_install::workspace::Workspace::load(root, &config, &core)?;
    let component = workspace.components
        .iter()
        .find(|component| component.id.to_string_without_version() == entry.identity)
        .ok_or_else(|| decline("cat workspace component absent"))?;
    let docs = json!({
        "directory":component.root_dir,
        "files":component.files.iter().map(|file| json!({
            "relativePath":file,
            "name":file.rsplit('/').next().unwrap_or(file),
            "test":false,
        })).collect::<Vec<_>>(),
    });
    let mut current = Vec::with_capacity(component.files.len());
    for name in &component.files {
        if !safe_relative(name) {
            return Err(decline("cat workspace file path"));
        }
        let path = component.dir.join(name);
        let metadata = std::fs::symlink_metadata(&path)?;
        if metadata.file_type().is_symlink()
            || !metadata.is_file()
            || metadata.len() > 8 * 1024 * 1024
        {
            return Err(decline("cat workspace file shape or size"));
        }
        let bytes = std::fs::read(path)?;
        current.push(json!({"path":name,"content":String::from_utf8_lossy(&bytes)}));
    }
    Ok(WorkspaceFiles { files: current, docs })
}

fn safe_relative(path: &str) -> bool {
    path == "."
        || (!path.is_empty()
            && Path::new(path)
                .components()
                .all(|component| matches!(component, Component::Normal(_))))
}
