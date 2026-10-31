//! Retain `InstallMain.install` while Rust runs the supported stock pnpm call.

use crate::{commands::status::cache::cache_root, host::Host};
use bit_install::{
    HostInfo,
    config::{EffectiveConfig, ScopeJson, WorkspaceConfig, load_global_config, scope_path},
    engine::{CanonicalInstall, OutputSink},
};
use serde_json::{Value, json};
use std::{
    env, io,
    path::Path,
    sync::{Arc, Mutex, PoisonError},
    thread,
};

enum Continuation {
    Resume(Value),
    Receipt(Value),
}

/// Resume the same published installation promise after each native engine call.
pub(super) fn call(
    host: &Host,
    info: &HostInfo,
    method: &str,
    params: &Value,
) -> io::Result<Value> {
    let mut receipt = host.call(method, params)?;
    while let Some(payload) = receipt.get("needsEngine") {
        receipt = match run(host, payload, info)? {
            Continuation::Resume(engine) => {
                host.call("installCanonicalResume", &json!({"engine": engine}))?
            }
            Continuation::Receipt(receipt) => receipt,
        };
    }
    Ok(receipt)
}

fn run(host: &Host, payload: &Value, info: &HostInfo) -> io::Result<Continuation> {
    if payload["umask"].as_u64() != Some(u64::from(pnpm_fs::file_mode::current_umask())) {
        crate::trace::log("stock pnpm installation uses a different Host file mask");
        return Ok(Continuation::Resume(json!({"supported": false, "stdout": ""})));
    }
    let Some(prepared) = CanonicalInstall::prepare(payload, info) else {
        crate::trace::log("stock pnpm installation options require the published engine adapter");
        return Ok(Continuation::Resume(json!({"supported": false, "stdout": ""})));
    };
    let result = host.call("installCanonicalEnginePrepare", &json!({}))?;
    if let Some(receipt) = result.get("receipt") {
        return Ok(Continuation::Receipt(receipt.clone()));
    }
    let path =
        result["path"].as_str().ok_or_else(|| io::Error::other("published build-script PATH"))?;
    Ok(Continuation::Resume(run_prepared(prepared, path.to_owned())))
}

fn run_prepared(prepared: CanonicalInstall, path: String) -> Value {
    let output = Arc::new(Mutex::new(String::new()));
    let captured = Arc::clone(&output);
    let sink = OutputSink(Arc::new(move |text| {
        captured
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push_str(text);
    }));
    crate::trace::log("running stock pnpm installation natively");
    let outcome = engine_thread(prepared, path, sink);
    let stdout = std::mem::take(&mut *output.lock().unwrap_or_else(PoisonError::into_inner));
    match outcome {
        Ok(result) => json!({"supported": true, "result": {
            "dependenciesChanged": result.dependencies_changed,
            "storeDir": result.store_dir,
            "depsRequiringBuild": result.deps_requiring_build,
        }, "stdout": stdout}),
        Err(error) => json!({
            "supported": true, "error": error.to_string(),
            "nativeError": native_error(&error), "stdout": stdout,
        }),
    }
}

fn native_error(error: &io::Error) -> Value {
    match bit_install::engine::EngineError::from_io(error) {
        Some(error) => json!({"code": error.code, "message": error.message, "hint": error.hint}),
        None => json!({"message": error.to_string()}),
    }
}

fn engine_thread(
    prepared: CanonicalInstall,
    build_scripts_path: String,
    output: OutputSink,
) -> io::Result<bit_install::engine::EngineResult> {
    let worker = thread::Builder::new()
        .name("bit-canonical-install".to_string())
        .stack_size(32 * 1024 * 1024)
        .spawn(move || {
            let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
            runtime.block_on(prepared.run(build_scripts_path, Some(output)))
        })?;
    worker.join().map_err(|_| io::Error::other("the native pnpm installation panicked"))?
}

pub(super) fn canonical_workspace(root: &Path, react_service: bool) -> io::Result<bool> {
    let config = WorkspaceConfig::load(root)?;
    let core: Vec<String> = serde_json::from_str(include_str!(
        "../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))?;
    let custom = |id: &str| {
        !core
            .iter()
            .any(|core| core == bit_install::config::aspect_id_without_version(id))
    };
    if config.aspects.keys().any(|id| custom(id)) || scope_has_custom_aspects(root, &custom)? {
        return Ok(true);
    }
    let global = load_global_config(&cache_root().join("config"))?;
    if global
        .keys()
        .any(|id| id.contains('/') && custom(id))
    {
        return Ok(true);
    }
    let raw = bit_install::jsonc::parse(&std::fs::read_to_string(&config.path)?)?;
    if !raw["require"].is_null()
        && raw["require"] != false
        && raw["require"] != json!([])
        && raw["require"] != ""
    {
        return Ok(true);
    }
    let workspace = bit_install::workspace::Workspace::load(root, &config, &core)?;
    Ok(workspace.components
        .iter()
        .any(|component| {
            let bare_env = bit_install::config::aspect_id_without_version(&component.env_id);
            (bare_env != "teambit.harmony/node"
                && !(react_service && bare_env == "teambit.react/react"))
                || component.config.keys().any(|id| custom(id))
        }))
}

fn scope_has_custom_aspects(root: &Path, custom: &impl Fn(&str) -> bool) -> io::Result<bool> {
    let path = scope_path(root).join("scope.jsonc");
    if !path.try_exists()? {
        return Ok(false);
    }
    let raw = bit_install::jsonc::parse(&std::fs::read_to_string(path)?)?;
    Ok(raw
        .as_object()
        .is_none_or(|entries| {
            entries
                .keys()
                .any(|id| id != "$schema" && id.contains('/') && custom(id))
        }))
}

/// `isFeatureEnabled(DEPS_GRAPH)`: `BIT_FEATURES`, else the `features` config.
pub(super) fn deps_graph_enabled(root: &Path) -> io::Result<bool> {
    let features = if let Some(features) = env::var("BIT_FEATURES")
        .ok()
        .filter(|features| !features.is_empty())
    {
        Some(features)
    } else {
        let global = load_global_config(&cache_root().join("config"))?;
        let scope = ScopeJson::load(&scope_path(root))?;
        let workspace = WorkspaceConfig::load(root)?;
        EffectiveConfig::new(&global, &scope.config, &workspace.config_store).get("features")
    };
    Ok(features.is_some_and(|features| {
        features
            .split(',')
            .any(|feature| feature.trim() == "deps-graph")
    }))
}
