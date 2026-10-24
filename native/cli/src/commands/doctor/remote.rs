//! Remote diagnostics reuse the configured client transport and local diagnosis engine.
use super::{
    catalog, checks,
    context::{Context, optional_json},
    options::Options,
    store,
};
use bit_client_transfer::{
    GlobalConfig,
    http::Network,
    remotes::{Remote, Remotes},
    resolver::Resolver,
};
use bit_workspace_config::global_config_dir;
use serde_json::Value;
use std::{fs, io, path::Path};

pub(super) struct Plan {
    remote: Remote,
    network: Network,
    name: String,
}

pub(super) fn prepare(context: &Context, options: &Options) -> io::Result<Option<Plan>> {
    let Some(name) = &options.remote else { return Ok(None) };
    let scope = context.scope
        .as_deref()
        .map(|scope| optional_json(&scope.join("scope.json")))
        .transpose()?
        .unwrap_or(Value::Null);
    let global = global(context);
    let package_dir =
        context.cli.bit_dir.as_ref().ok_or_else(|| io::Error::other("missing Bit package"))?;
    let package: Value = serde_json::from_slice(&fs::read(package_dir.join("package.json"))?)?;
    let network = Network::new(
        &global,
        package["version"].as_str().unwrap_or_default(),
        scope["name"].as_str(),
        None,
    )?;
    let resolver = Resolver::configured(
        &scope,
        context.cli.node.clone(),
        package_dir.clone(),
        scope["name"].as_str().unwrap_or_default(),
        &global,
    );
    let remotes = Remotes::load(&scope, &global_config_dir(), &global)?.with_resolver(resolver);
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    let remote = runtime.block_on(remotes.resolve(name, &network))?;
    if let Remote::File(path) = &remote {
        preflight(context, options, path)?;
    }
    Ok(Some(Plan { remote, network, name: name.clone() }))
}

fn global(context: &Context) -> GlobalConfig {
    let global: GlobalConfig = context.config
        .as_object()
        .into_iter()
        .flatten()
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();
    bit_client_transfer::config::effective(global, &Value::Null, &Value::Null)
}
fn preflight(context: &Context, options: &Options, path: &Path) -> io::Result<()> {
    let probe = Context {
        root: context.root.clone(),
        scope: Some(path.to_path_buf()),
        config: context.config.clone(),
        cli: context.cli.clone(),
        timestamp: context.timestamp,
    };
    if options.name
        .as_deref()
        .is_none_or(|name| name == "validate scope objects")
    {
        store::preflight(&probe, Some("validate scope objects"))?;
    }
    Ok(())
}

pub(super) fn examine(
    context: &Context,
    options: &Options,
    plan: &Plan,
) -> io::Result<(Vec<Value>, Value)> {
    match &plan.remote {
        Remote::Http(url) => {
            let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
            let mut response =
                runtime.block_on(plan.network.doctor(url, &plan.name, options.name.as_deref()))?;
            let results = response["examineResults"]
                .as_array_mut()
                .ok_or_else(|| io::Error::other("remote doctor results"))?;
            if options.name.is_some() && results.is_empty() {
                return Err(io::Error::other(format!(
                    "error: diagnosis {} not found",
                    options.name.as_deref().unwrap_or_default(),
                )));
            }
            let results = std::mem::take(results);
            Ok((results, response["metaData"].take()))
        }
        Remote::File(path) => file(context, options, path),
    }
}

fn file(context: &Context, options: &Options, path: &Path) -> io::Result<(Vec<Value>, Value)> {
    let diagnoses: Vec<_> = catalog::DIAGNOSES
        .iter()
        .filter(|diagnosis| {
            options.name
                .as_deref()
                .is_none_or(|name| name == diagnosis.name)
        })
        .collect();
    if diagnoses.is_empty() {
        return Err(io::Error::other(format!(
            r#"Diagnosis "{}" not found"#,
            options.name.as_deref().unwrap_or_default(),
        )));
    }
    let mut results = Vec::new();
    for diagnosis in diagnoses {
        let result = if diagnosis.name == "validate scope objects" {
            store::heads(diagnosis, Some(path))
        } else {
            checks::examine(diagnosis, context)
        };
        match result {
            Ok(result) => results.push(result),
            Err(error) if options.name.is_some() => return Err(error),
            Err(_) => {}
        }
    }
    Ok((results, context.metadata()?))
}
