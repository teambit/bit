//! Exact native inputs for the retained package-manager subscriber receiver.
use super::{Calculated, Loaded, Session};
use serde_json::{Value, json};
use std::io;

pub(super) async fn run(
    session: &Session<'_>,
    loaded: &Loaded,
    calculated: &Calculated,
    phase: &str,
) -> io::Result<Option<Value>> {
    let components = calculated.components.iter().filter(|component| component.root_dir != ".")
        .map(|component| json!({"id":component_id(&component.id),"directory":session.root.join(&component.root_dir)}))
        .collect::<Vec<_>>();
    let mut options = json!({"linkedDependencies":{session.root.to_string_lossy().as_ref():calculated.subscriber_links},"installTeambitBit":false});
    if let Some(version) = calculated.outcome.plan.forced_harmony_version
        .as_deref()
        .map(str::trim)
        .filter(|version| !version.is_empty())
    {
        options["forcedHarmonyVersion"] = json!(version);
    }
    session.host.install_subscribers(&json!({
        "phase":phase,"rootDir":session.root,"components":components,
        "rootPolicy":calculated.subscriber_policy,"options":options,
        "packageManagerOptions":package_options(session, loaded, calculated)?,
    }))
    .await
}

fn component_id(id: &crate::model::ComponentId) -> String {
    let identity = id.to_string_without_version();
    id.version
        .as_deref()
        .map(str::trim)
        .filter(|version| !version.is_empty())
        .map_or_else(|| identity.clone(), |version| format!("{identity}@{version}"))
}

fn package_options(
    session: &Session<'_>,
    loaded: &Loaded,
    calculated: &Calculated,
) -> io::Result<Value> {
    let config = &loaded.config.dependency_resolver;
    let raw = serde_json::to_value(config).map_err(io::Error::other)?;
    let mut options = json!({
        "copyPeerToRuntimeOnComponents":session.options.copy_peer_to_runtime_on_components,
        "copyPeerToRuntimeOnRoot":session.options.copy_peer_to_runtime_on_root.unwrap_or(true),
        "dedupe":!config.has_root_components() && !session.options.skip_dedupe,
        "nodeLinker":config.node_linker(),"resolveEnvPeersFromRoot":config.resolve_env_peers_from_root(),
        "rootComponents":config.has_root_components(),"updateAll":session.options.update,
        "lockfileOnly":session.options.lockfile_only,"includeOptionalDeps":!session.options.no_optional,
        "failOnDependenciesGraphError":session.options.restore,
        "overrides":calculated.outcome.plan.overrides,
    });
    copy_config(&raw, &mut options);
    if let Some(throttle) = &session.options.throttle_progress {
        options["throttleProgress"] = throttle.clone();
    }
    if let Some(graph) = &session.options.dependencies_graph {
        options["dependenciesGraph"] = graph.clone();
    }
    Ok(options)
}

fn copy_config(raw: &Value, options: &mut Value) {
    for key in [
        "autoInstallPeers",
        "dedupePeers",
        "neverBuiltDependencies",
        "allowScripts",
        "dangerouslyAllowAllScripts",
        "hoistPatterns",
        "hoistInjectedDependencies",
        "packageImportMethod",
    ] {
        if !raw[key].is_null() {
            options[key] = raw[key].clone();
        }
    }
}
