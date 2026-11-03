//! Remote diagnostics ([`Plan`], [`prepare`], [`Context`], [`Options`]) reuse the configured client transport and local diagnosis engine.
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

/// Resolved [`Remote`] endpoint and [`Network`] transport for `bit doctor --remote <scope>`.
pub(super) struct Plan {
    remote: Remote,
    network: Network,
    name: String,
}

/// Resolves `--remote` from `options` ([`Options`]) and `context` ([`Context`]) into a [`Plan`] via [`build_remotes_and_network`].
pub(super) fn prepare(context: &Context, options: &Options) -> io::Result<Option<Plan>> {
    let Some(name) = options.remote
        .as_deref()
        .map(str::trim)
        .filter(|remote_name| !remote_name.is_empty())
    else {
        return Ok(None);
    };
    let scope = context.scope
        .as_deref()
        .map(|scope| optional_json(&scope.join("scope.json")))
        .transpose()?
        .unwrap_or(Value::Null);
    let global = global(context);
    let (remotes, network) = build_remotes_and_network(context, &scope, &global)?;
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    let remote = runtime.block_on(remotes.resolve(name, &network))?;
    if let Remote::File(path) = &remote {
        preflight(context, options, path)?;
    }
    Ok(Some(Plan { remote, network, name: name.to_owned() }))
}

/// Constructs the configured [`Remotes`] registry ([`Resolver`]) and [`Network`] client for remote doctor checks.
fn build_remotes_and_network(
    context: &Context,
    scope: &Value,
    global: &GlobalConfig,
) -> io::Result<(Remotes, Network)> {
    let package_dir =
        context.cli.bit_dir.as_ref().ok_or_else(|| io::Error::other("missing Bit package"))?;
    let package: Value =
        bit_object_import::parse_jsonc(&fs::read(package_dir.join("package.json"))?)?;
    let scope_name = scope["name"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let network = Network::new(
        global,
        package["version"]
            .as_str()
            .map(str::trim)
            .unwrap_or_default(),
        scope_name,
        None,
    )?;
    let resolver = Resolver::configured(
        scope,
        context.cli.node.clone(),
        package_dir.clone(),
        scope_name.unwrap_or_default(),
        global,
    );
    let remotes = Remotes::load(scope, &global_config_dir(), global)?.with_resolver(resolver);
    Ok((remotes, network))
}

/// Builds the effective [`GlobalConfig`] map from `context.config`.
#[inline]
fn global(context: &Context) -> GlobalConfig {
    let global: GlobalConfig = context.config
        .as_object()
        .into_iter()
        .flatten()
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();
    bit_client_transfer::config::effective(global, &Value::Null, &Value::Null)
}
/// Returns the trimmed single diagnosis name requested on [`Options`], if any.
#[inline]
fn requested_name(options: &Options) -> Option<&str> {
    options.name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
}

#[inline]
fn preflight(context: &Context, options: &Options, path: &Path) -> io::Result<()> {
    let probe = Context {
        root: context.root.clone(),
        scope: Some(path.to_path_buf()),
        config: context.config.clone(),
        cli: context.cli.clone(),
        timestamp: context.timestamp,
    };
    if requested_name(options).is_none_or(|name| name == "validate scope objects") {
        store::preflight(&probe, Some("validate scope objects"))?;
    }
    Ok(())
}

#[inline]
fn take_examine_results(response: &mut Value) -> io::Result<Vec<Value>> {
    if let Some(arr) = response["examineResults"].as_array_mut() {
        Ok(std::mem::take(arr))
    } else if response["examineResult"].is_object() {
        Ok(vec![response["examineResult"].take()])
    } else if response.get("examineResult").is_some_and(Value::is_null) {
        Ok(Vec::new())
    } else {
        Err(io::Error::other("remote doctor results"))
    }
}

pub(super) fn examine(
    context: &Context,
    options: &Options,
    plan: &Plan,
) -> io::Result<(Vec<Value>, Value)> {
    let requested = requested_name(options);
    match &plan.remote {
        Remote::Http(url) => {
            let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
            let mut response = runtime.block_on(plan.network.doctor(url, &plan.name, requested))?;
            let results = take_examine_results(&mut response)?;
            if let Some(name) = requested
                && results.is_empty()
            {
                return Err(io::Error::other(format!("error: diagnosis {name} not found")));
            }
            let meta = if response["metaData"].is_null() {
                response["metadata"].take()
            } else {
                response["metaData"].take()
            };
            Ok((results, meta))
        }
        Remote::File(path) => file(context, options, path),
    }
}

fn file(context: &Context, options: &Options, path: &Path) -> io::Result<(Vec<Value>, Value)> {
    let requested = requested_name(options);
    let diagnoses: Vec<_> = catalog::DIAGNOSES
        .iter()
        .filter(|diagnosis| requested.is_none_or(|name| name == diagnosis.name))
        .collect();
    if diagnoses.is_empty() {
        return Err(io::Error::other(format!(
            r#"Diagnosis "{}" not found"#,
            requested.unwrap_or_default(),
        )));
    }
    let mut results = Vec::with_capacity(diagnoses.len());
    for diagnosis in diagnoses {
        let result = if diagnosis.name == "validate scope objects" {
            store::heads(diagnosis, Some(path))
        } else {
            checks::examine(diagnosis, context)
        };
        match result {
            Ok(result) => results.push(result),
            Err(error) if requested.is_some() => return Err(error),
            Err(_) => {}
        }
    }
    Ok((results, context.metadata()?))
}
