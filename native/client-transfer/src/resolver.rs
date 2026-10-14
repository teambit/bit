//! A custom remote resolver (`scope.json` `resolverPath`, `remote-resolver.ts`).
//! The resolver is a JavaScript module exporting
//! `(scopeName, thisScopeName, token) => Promise<url>`; it replaces the hub
//! lookup for scopes no remote is configured for. Like pnpm's one-shot
//! pnpmfile hooks, it runs in the Node.js that runs Bit.

use crate::{GlobalConfig, invalid};
use serde_json::Value;
use std::{
    io,
    path::PathBuf,
    process::{Command, Stdio},
};

/// `CFG_USER_TOKEN_KEY`: the resolver gets the configured token, not `--token`.
const CFG_USER_TOKEN: &str = "user.token";

/// Calls the module and prints the URL its promise resolves to.
const SCRIPT: &str = "\
const [path, scope, thisScope, token] = process.argv.slice(1);\
Promise.resolve(require(path)(scope, thisScope || undefined, token || undefined)).then(\
(url) => process.stdout.write(String(url)),\
(error) => { process.stderr.write(String((error && error.message) || error)); process.exit(1); });";

/// The configured resolver of the workspace scope.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resolver {
    pub path: String,
    pub node: PathBuf,
    /// `thisScope.name`.
    pub this_scope: String,
    pub token: Option<String>,
}

impl Resolver {
    /// The resolver `scope.json` names, if any.
    #[must_use]
    pub fn configured(
        scope_json: &Value,
        node: PathBuf,
        this_scope: &str,
        global: &GlobalConfig,
    ) -> Option<Self> {
        let path = scope_json["resolverPath"]
            .as_str()
            .filter(|path| !path.is_empty())?;
        let token = global
            .get(CFG_USER_TOKEN)
            .and_then(Value::as_str)
            .map(str::to_string);
        Some(Self { path: path.to_string(), node, this_scope: this_scope.to_string(), token })
    }

    /// `resolverFunction(scopeName, thisScope.name, token)`.
    pub async fn resolve(&self, scope: &str) -> io::Result<String> {
        let resolver = self.clone();
        let scope = scope.to_string();
        tokio::task::spawn_blocking(move || resolver.run(&scope)).await.map_err(io::Error::other)?
    }

    fn run(&self, scope: &str) -> io::Result<String> {
        let node = if self.node.as_os_str().is_empty() {
            PathBuf::from("node")
        } else {
            self.node.clone()
        };
        let output = Command::new(node)
            .args(["-e", SCRIPT, &self.path, scope, &self.this_scope])
            .arg(self.token.as_deref().unwrap_or_default())
            .stdin(Stdio::null())
            .output()?;
        if !output.status.success() {
            return Err(io::Error::other(
                String::from_utf8_lossy(&output.stderr).trim().to_string(),
            ));
        }
        String::from_utf8(output.stdout)
            .map_err(|_| invalid("the remote resolver returned a non UTF-8 URL"))
    }
}

#[cfg(test)]
mod tests;
