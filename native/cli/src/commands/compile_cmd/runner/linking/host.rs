//! Fixed [`Builtin`] Node and React package [`Host`] properties; arbitrary environment callbacks remain guarded.
//!
//! Supplies default `main` and `types` `package.json` properties for built-in environments.
use async_trait::async_trait;
use bit_install::host::{AfterInstall, AfterInstallResult, Host};
use serde_json::{Value, json};
use std::io;
/// Static [`Host`] implementation for built-in Node and React compilation environments.
pub(super) struct Builtin;
/// Constructs the error returned when a non-supported [`Host`] callback is invoked during compilation.
#[inline]
fn unsupported() -> io::Error {
    io::Error::other("unexpected compiler environment callback")
}
#[async_trait]
impl Host for Builtin {
    async fn env_policy(&self, _env_id: &str) -> io::Result<Option<Value>> {
        Err(unsupported())
    }
    async fn app_types(&self) -> io::Result<Vec<String>> {
        Err(unsupported())
    }
    async fn package_json_props(&self, env_id: &str) -> io::Result<Value> {
        if !is_supported_builtin_env(env_id) {
            return Err(unsupported());
        }
        Ok(
            json!({"props":{"main":"dist/{main}.js","types":"{main}.ts"},"modifiesPackageJson":false}),
        )
    }
    async fn transform_package_json(
        &self,
        _component: &str,
        _manifest: Value,
    ) -> io::Result<Value> {
        Err(unsupported())
    }
    async fn after_install(&self, _request: AfterInstall) -> io::Result<AfterInstallResult> {
        Err(unsupported())
    }
    async fn confirm(&self, _question: &str) -> io::Result<bool> {
        Err(unsupported())
    }
}

#[inline]
fn is_supported_builtin_env(env_id: &str) -> bool {
    let trimmed = env_id.trim();
    !trimmed.is_empty()
        && trimmed
            .split_once('@')
            .is_none_or(|(_, ver)| {
                let ver = ver.trim();
                !ver.is_empty() && !ver.contains('@') && !ver.chars().any(char::is_whitespace)
            })
        && matches!(
            bit_install::config::aspect_id_without_version(trimmed).trim().trim_end_matches('/'),
            "teambit.harmony/node" | "teambit.react/react",
        )
}
