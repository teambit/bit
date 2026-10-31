//! Recovery invokes the retained native importer before updating remove configuration.
use super::{Planned, options, render};
use crate::commands::{color::Chalk, installation, workspace_command};
use bit_install::output::Output;
use serde_json::Value;
use std::{fs, io, path::Path, time::Instant};

pub(in crate::commands) struct RecoverOptions {
    pub skip_write_config_files: bool,
}
pub(in crate::commands) fn recover_import(
    root: &Path,
    ids: &[String],
    options: &RecoverOptions,
    chalk: Chalk,
    output: &Output,
    installer: Option<installation::Installer>,
) -> io::Result<Value> {
    let options = import_options(ids, options.skip_write_config_files, installer.is_none());
    let mut planned = Planned::plan_with(root, &options, &options.ids, chalk, true)?;
    let started = Instant::now();
    planned.apply()?;
    render(&mut planned, &options, output, started, installer, root)?;
    bit_object_import::parse_jsonc(&fs::read(root.join(".bitmap"))?)
}

pub(in crate::commands) fn recover_probe(
    root: &Path,
    ids: &[String],
) -> io::Result<std::collections::BTreeMap<String, bool>> {
    let cli = workspace_command::NodeCli::find()?;
    let config = crate::commands::status::cache::cache_root().join("config");
    let transport = serde_json::json!({"globalConfigDir":config,"nodeExecutable":cli.node,"bitDir":cli.bit_dir,"bitVersion":cli.version});
    let (remotes, network) = bit_object_import::recovery_remote_connection(
        root,
        &workspace_command::home(),
        &transport,
    )?;
    bit_object_import::component_recover::probe_remote(ids, &remotes, &network)
}

pub(in crate::commands) fn recover_scope_import(
    root: &Path,
    ids: &[String],
    output: &Output,
) -> io::Result<()> {
    for id in ids {
        let trimmed = id.trim();
        if trimmed.is_empty() {
            return Err(io::Error::other("recover scope import id is empty"));
        }
        let single = [trimmed.to_owned()];
        let mut options = import_options(&single, false, false);
        options.objects_only = true;
        options.write.override_existing = false;
        let (mut engine, prepared) = super::prepare(root, &options, &single)?;
        let reason = format!("1 components {trimmed} because it's missing from the local scope");
        output.status(&format!("importing {reason}"));
        super::apply_status_refresh(&mut engine, &prepared["token"])?;
        output.status(&format!("successfully imported {reason}"));
    }
    Ok(())
}

fn import_options(ids: &[String], skip_config: bool, skip_installation: bool) -> options::Options {
    options::Options {
        operation: "import",
        ids: ids
            .iter()
            .map(|id| id.trim().to_owned())
            .collect(),
        objects_only: false,
        all_history: false,
        write: options::WriteOptions {
            skip_write_config_files: skip_config,
            skip_dependency_installation: skip_installation,
            override_existing: true,
            merge: false,
            path: None,
            merge_strategy: None,
            dependencies: options::DependencyOptions::default(),
            adoption: options::AdoptionOptions::default(),
        },
        lanes: false,
        output: options::OutputOptions::default(),
        selection: options::SelectionOptions::default(),
    }
}
