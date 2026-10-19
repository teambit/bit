//! Retain `InstallMain.install` while Rust runs the supported stock pnpm call.

use crate::host::Host;
use bit_install::{
    HostInfo,
    engine::{CanonicalInstall, OutputSink},
};
use serde_json::{Value, json};
use std::{
    io,
    sync::{Arc, Mutex, PoisonError},
    thread,
};

/// Resume the same published installation promise after each native engine call.
pub(super) fn call(
    host: &Host,
    info: &HostInfo,
    method: &str,
    params: &Value,
) -> io::Result<Value> {
    let mut receipt = host.call(method, params)?;
    while let Some(payload) = receipt.get("needsEngine") {
        let engine = run(host, payload, info)?;
        receipt = host.call("installCanonicalResume", &json!({"engine": engine}))?;
    }
    Ok(receipt)
}

fn run(host: &Host, payload: &Value, info: &HostInfo) -> io::Result<Value> {
    if payload["umask"].as_u64() != Some(u64::from(pnpm_fs::file_mode::current_umask())) {
        crate::trace::log("stock pnpm installation uses a different Host file mask");
        return Ok(json!({"supported": false, "stdout": ""}));
    }
    let Some(prepared) = CanonicalInstall::prepare(payload, info) else {
        crate::trace::log("stock pnpm installation options require the published engine adapter");
        return Ok(json!({"supported": false, "stdout": ""}));
    };
    let path = host.call("installCanonicalEnginePrepare", &json!({}))?;
    let path = path.as_str().ok_or_else(|| io::Error::other("published build-script PATH"))?;
    let output = Arc::new(Mutex::new(String::new()));
    let captured = Arc::clone(&output);
    let sink = OutputSink(Arc::new(move |text| {
        captured
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push_str(text);
    }));
    crate::trace::log("running stock pnpm installation natively");
    let outcome = engine_thread(prepared, path.to_owned(), sink);
    let stdout = std::mem::take(&mut *output.lock().unwrap_or_else(PoisonError::into_inner));
    Ok(match outcome {
        Ok(result) => json!({"supported": true, "result": {
            "dependenciesChanged": result.dependencies_changed,
            "storeDir": result.store_dir,
            "depsRequiringBuild": result.deps_requiring_build,
        }, "stdout": stdout}),
        Err(error) => json!({
            "supported": true, "error": error.to_string(),
            "nativeError": native_error(&error), "stdout": stdout,
        }),
    })
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
