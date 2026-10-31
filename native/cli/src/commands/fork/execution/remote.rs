use super::{Results, copy, source_facts};
use crate::commands::{
    add::ProjectedLinker, color::Chalk, fork::options::Options, workspace_command,
};
use bit_object_import::component_fork::RemoteCapture;
use serde_json::json;
use std::{io, path::Path};
pub(super) fn run(
    root: &Path,
    options: &Options,
    ids: &[String],
    scope: &str,
    linker: &mut ProjectedLinker,
    chalk: Chalk,
    results: &mut Results,
) -> io::Result<()> {
    let (remotes, network) = connection(root)?;
    let groups = if options.scope_fork {
        vec![ids.to_vec()]
    } else {
        ids.iter()
            .map(|id| vec![id.clone()])
            .collect()
    };
    for ids in groups {
        let captured = if options.scope_fork {
            RemoteCapture::fetch_many(&ids, &remotes, &network)?
        } else {
            RemoteCapture::fetch(&ids, &remotes, &network)?
        };
        captured.validate()?;
        copy_sources(root, options, scope, linker, chalk, results, (&captured, &ids))?;
        captured.validate()?;
        results.captures.push(captured);
    }
    Ok(())
}
fn connection(
    root: &Path,
) -> io::Result<(bit_client_transfer::remotes::Remotes, bit_client_transfer::http::Network)> {
    let cli = workspace_command::NodeCli::find()?;
    let transport = json!({"globalConfigDir":crate::commands::status::cache::cache_root().join("config"),"nodeExecutable":cli.node,"bitDir":cli.bit_dir,"bitVersion":cli.version});
    bit_object_import::recovery_remote_connection(root, &workspace_command::home(), &transport)
}
fn copy_sources(
    root: &Path,
    options: &Options,
    scope: &str,
    linker: &mut ProjectedLinker,
    chalk: Chalk,
    results: &mut Results,
    captured: (&RemoteCapture, &[String]),
) -> io::Result<()> {
    let (captured, ids) = captured;
    let loaded_ids = loaded_source_ids(captured);
    linker.call(
        root,
        "forkRemoteHydrate",
        &json!({"objects":captured.objects(),"ids":loaded_ids}),
    )?;
    for id in ids {
        let identity = id
            .split('@')
            .next()
            .unwrap_or(id)
            .trim();
        let row = captured
            .sources()
            .iter()
            .find(|row| row["identity"].as_str().map(str::trim) == Some(identity))
            .ok_or_else(|| io::Error::other("fork captured selection missing"))?;
        let mut source = row.clone();
        let facts = source_facts(root, linker, &mut source, true)?;
        captured.validate()?;
        let target = copy::run(root, options, scope, &source, true, linker, chalk)?;
        results.old_packages.push(
            facts["packageName"]
                .as_str()
                .map(str::trim)
                .filter(|pkg| !pkg.is_empty())
                .ok_or_else(|| io::Error::other("fork source package"))?
                .to_owned(),
        );
        results.facts.push(facts);
        results.ids.push(target);
    }
    Ok(())
}

fn loaded_source_ids(captured: &RemoteCapture) -> Vec<String> {
    captured
        .sources()
        .iter()
        .map(|row| {
            let identity = row["identity"].as_str().map_or("", str::trim);
            let version = row["version"].as_str().map_or("", str::trim);
            if version.is_empty() { identity.to_owned() } else { format!("{identity}@{version}") }
        })
        .collect()
}
