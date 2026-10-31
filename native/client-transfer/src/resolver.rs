//! A custom remote resolver (`scope.json` `resolverPath`, `remote-resolver.ts`).
//! The resolver is a JavaScript module exporting
//! `(scopeName, thisScopeName, token) => Promise<url>`; it replaces the hub
//! lookup for scopes no remote is configured for. Like pnpm's one-shot
//! pnpmfile hooks, it runs in the Node.js that runs Bit.
//!
//! Bit `require`s the path from `remote-resolver.js` of `@teambit/scope.remotes`,
//! so a relative path or a package name resolves from that module, not from the
//! current directory.

#[cfg(test)]
mod tests;

use crate::{GlobalConfig, invalid};
use serde_json::Value;
use std::{
    io,
    path::PathBuf,
    process::{Command, Stdio},
};

/// `CFG_USER_TOKEN_KEY`: the resolver gets the configured token, not `--token`.
const CFG_USER_TOKEN: &str = "user.token";

/// `remote-resolver.js` relative to the main module of `@teambit/scope.remotes`.
const RESOLVER_MODULE: &str = "remote-resolver/remote-resolver.js";

/// Calls the module and prints the URL its promise resolves to. Without an
/// installed `@teambit/scope.remotes` (no bit directory), it resolves from the
/// current directory.
const SCRIPT: &str = "\
const [path, scope, thisScope, token, bitDir, module] = process.argv.slice(1);\
let load = require;\
if (bitDir) try {\
const main = require.resolve('@teambit/scope.remotes', { paths: [bitDir] });\
load = require('module').createRequire(require('path').join(require('path').dirname(main), module));\
} catch {}\
Promise.resolve(load(path)(scope, thisScope || undefined, token || undefined)).then(\
(url) => process.stdout.write(String(url)),\
(error) => { process.stderr.write(String((error && error.message) || error)); process.exit(1); });";

/// The configured resolver of the workspace scope.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resolver {
    pub path: String,
    pub node: PathBuf,
    /// The `@teambit/bit` package dir, where `@teambit/scope.remotes` resolves from.
    pub bit_dir: PathBuf,
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
        bit_dir: PathBuf,
        this_scope: &str,
        global: &GlobalConfig,
    ) -> Option<Self> {
        let path = scope_json["resolverPath"]
            .as_str()
            .map(str::trim)
            .filter(|path| !path.is_empty())?;
        let token = global
            .get(CFG_USER_TOKEN)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|token| !token.is_empty())
            .map(str::to_string);
        Some(Self {
            path: path.to_string(),
            node,
            bit_dir,
            this_scope: this_scope.trim().to_string(),
            token,
        })
    }

    /// `resolverFunction(scopeName, thisScope.name, token)`.
    pub async fn resolve(&self, scope: &str) -> io::Result<String> {
        let resolver = self.clone();
        let scope = scope.trim().to_string();
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
            .arg(&self.bit_dir)
            .arg(RESOLVER_MODULE)
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
