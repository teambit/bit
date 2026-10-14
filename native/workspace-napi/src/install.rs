//! `install(argv, cwd, hostInfo, host, output)`: native `bit install`.
//!
//! Mirrors how `@pnpm/napi` runs its engine: the command runs on a dedicated
//! 32 MiB-stack thread with its own multi-thread tokio runtime, and JavaScript
//! is reached only through thread-safe functions. `host(method, payload)`
//! serves the callbacks components implement in JavaScript and returns a
//! promise of a JSON string; `output(text)` receives all terminal output.

// napi-derive expands `#[napi] async fn` into a module-level trampoline whose
// generated `NapiRefContainer` ends in `[napi_ref; 0]`.
#![expect(
    clippy::trailing_empty_array,
    reason = "napi-derive generates a trailing zero-sized array in its FFI trampoline"
)]

use async_trait::async_trait;
use bit_install::{AfterInstall, AfterInstallResult, Host, HostInfo, Outcome};
use napi::{
    Status,
    bindgen_prelude::{FnArgs, Promise},
    threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use napi_derive::napi;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use std::{io, path::PathBuf, sync::Arc};

/// `(method, payloadJson) => Promise<resultJson>`.
pub type HostCallback = ThreadsafeFunction<
    FnArgs<(String, String)>,
    Promise<String>,
    FnArgs<(String, String)>,
    Status,
    false,
>;

/// `(text) => void`, written to `process.stdout` by the caller.
pub type OutputCallback = ThreadsafeFunction<String, (), String, Status, false>;

/// Result of [`install`]: `{ outcome: "installed", components }`, `{ outcome: "help" }`,
/// or `{ outcome: "unsupported" }` for workspaces the TypeScript command installs.
#[napi]
pub async fn install(
    argv: Vec<String>,
    cwd: String,
    host_info: String,
    host: HostCallback,
    output: OutputCallback,
) -> napi::Result<String> {
    let info: HostInfo = serde_json::from_str(&host_info).map_err(failure)?;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    std::thread::Builder::new()
        .name("bit-install".to_string())
        // The engine's synchronous call chain overflows a default stack on some platforms.
        .stack_size(32 * 1024 * 1024)
        .spawn(move || {
            let _ = sender.send(run_blocking(&argv, &cwd, &info, host, output));
        })
        .map_err(failure)?;
    receiver.await.map_err(|_| failure("bit install thread panicked"))?
}

fn run_blocking(
    argv: &[String],
    cwd: &str,
    info: &HostInfo,
    host: HostCallback,
    output: OutputCallback,
) -> napi::Result<String> {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(failure)?;
    let output = Arc::new(output);
    let sink: bit_install::output::Sink = Arc::new(move |text: &str| {
        output.call(text.to_string(), ThreadsafeFunctionCallMode::Blocking);
    });
    let host = JsHost { callback: host };
    let outcome = runtime
        .block_on(bit_install::run(&PathBuf::from(cwd), argv, info, &host, sink))
        .map_err(failure)?;
    let result = match outcome {
        Outcome::Installed(summary) => {
            json!({ "outcome": "installed", "components": summary.components })
        }
        Outcome::Help => json!({ "outcome": "help" }),
        Outcome::Unsupported => json!({ "outcome": "unsupported" }),
    };
    Ok(result.to_string())
}

struct JsHost {
    callback: HostCallback,
}

impl JsHost {
    async fn call<Response: DeserializeOwned>(
        &self,
        method: &str,
        payload: Value,
    ) -> io::Result<Response> {
        let payload = payload.to_string();
        let promise = self.callback
            .call_async(FnArgs::from((method.to_string(), payload)))
            .await
            .map_err(|error| io::Error::other(error.to_string()))?;
        let result = promise.await.map_err(|error| io::Error::other(error.to_string()))?;
        serde_json::from_str(&result).map_err(io::Error::other)
    }
}

#[async_trait]
impl Host for JsHost {
    async fn env_policy(&self, env_id: &str) -> io::Result<Option<Value>> {
        self.call("envPolicy", json!({ "envId": env_id })).await
    }

    async fn app_types(&self) -> io::Result<Vec<String>> {
        self.call("appTypes", json!({})).await
    }

    async fn package_json_props(&self, env_id: &str) -> io::Result<Value> {
        self.call("packageJsonProps", json!({ "envId": env_id })).await
    }

    async fn transform_package_json(&self, component: &str, manifest: Value) -> io::Result<Value> {
        self.call("transformPackageJson", json!({ "component": component, "manifest": manifest }))
            .await
    }

    async fn after_install(&self, request: AfterInstall) -> io::Result<AfterInstallResult> {
        let request = serde_json::to_value(request).map_err(io::Error::other)?;
        self.call("afterInstall", request).await
    }

    async fn confirm(&self, question: &str) -> io::Result<bool> {
        self.call("confirm", json!({ "question": question })).await
    }
}

/// Honor the `TRACE` env var for the engine, as `@pnpm/napi` does: an addon has
/// no `main`, so the subscriber is installed when the module loads.
#[napi_derive::module_init]
fn init_tracing() {
    pnpm_diagnostics::enable_tracing_by_env();
}

fn failure(error: impl std::fmt::Display) -> napi::Error {
    napi::Error::from_reason(error.to_string())
}
