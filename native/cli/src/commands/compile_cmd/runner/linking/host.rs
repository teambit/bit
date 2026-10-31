//! Fixed Node and React package properties; arbitrary environment callbacks remain guarded.
use async_trait::async_trait;
use bit_install::host::{AfterInstall, AfterInstallResult, Host};
use serde_json::{Value, json};
use std::io;
pub(super) struct Builtin;
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
        let bare = bit_install::config::aspect_id_without_version(env_id);
        if !matches!(bare, "teambit.harmony/node" | "teambit.react/react") {
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
