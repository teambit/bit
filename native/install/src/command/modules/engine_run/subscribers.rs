//! Exact native inputs for the retained package-manager pre/post subscriber receiver.
//!
//! [`run`] serializes [`Session`], [`Loaded`], and [`Calculated`] state into [`Value`] payloads for host subscribers.
use super::{Calculated, Loaded, Session};
use serde_json::{Value, json};
use std::io;

/// Invoke the host's package-manager subscriber callback for `phase` (`"pre"` or `"post"`).
pub(super) async fn run(
    session: &Session<'_>,
    loaded: &Loaded,
    calculated: &Calculated,
    phase: &str,
) -> io::Result<Option<Value>> {
    let components = calculated.components
        .iter()
        .filter_map(|component| {
            let rel = component.root_dir
                .trim()
                .trim_start_matches("./")
                .trim_start_matches(r".\")
                .trim_matches(['/', '\\']);
            (!rel.is_empty() && rel != ".").then(
                || json!({"id":component_id(&component.id),"directory":session.root.join(rel)}),
            )
        })
        .collect::<Vec<_>>();
    let mut options = json!({"linkedDependencies":{session.root.to_string_lossy().as_ref():calculated.subscriber_links},"installTeambitBit":false});
    if let Some(version) = calculated.outcome.plan.forced_harmony_version
        .as_deref()
        .map(str::trim)
        .filter(|version| !version.is_empty())
    {
        options["forcedHarmonyVersion"] = json!(version);
    }
    let phase = phase.trim();
    session.host.install_subscribers(&json!({
        "phase":phase,"rootDir":session.root,"components":components,
        "rootPolicy":calculated.subscriber_policy,"options":options,
        "packageManagerOptions":package_options(session, loaded, calculated)?,
    }))
    .await
}

/// Formats `id` as `scope/name` with `@<version>` appended when a version is present.
#[inline]
fn component_id(id: &crate::model::ComponentId) -> String {
    let mut identity = id.to_string_without_version();
    if let Some(version) = id.version
        .as_deref()
        .map(str::trim)
        .filter(|ver| !ver.is_empty())
    {
        identity.push('@');
        identity.push_str(version);
    }
    identity
}

/// Builds the serialized `packageManagerOptions` [`Value`] map passed to install subscribers.
#[inline]
fn package_options(
    session: &Session<'_>,
    loaded: &Loaded,
    calculated: &Calculated,
) -> io::Result<Value> {
    let config = &loaded.config.dependency_resolver;
    let mut raw = serde_json::to_value(config).map_err(io::Error::other)?;
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
    copy_config(&mut raw, &mut options);
    if let Some(throttle) = &session.options.throttle_progress {
        options["throttleProgress"] = throttle.clone();
    }
    if let Some(graph) = &session.options.dependencies_graph {
        options["dependenciesGraph"] = graph.clone();
    }
    Ok(options)
}

#[inline]
fn copy_config(raw: &mut Value, options: &mut Value) {
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
        let value = raw[key].take();
        if !value.is_null() {
            options[key] = value;
        }
    }
}
