//! A custom remote resolver (`scope.json` `resolverPath`, `remote-resolver.ts`).
//! The resolver is a `JavaScript` module exporting
//! `(scopeName, thisScopeName, token) => Promise<url>`; it replaces the hub
//! lookup for scopes no remote is configured for. Like pnpm's one-shot
//! pnpmfile hooks, it runs in the Node.js that runs Bit.
//!
//! Bit `require`s the path from [`RESOLVER_MODULE`] of `@teambit/scope.remotes`,
//! so a relative path or a package name resolves from that module, not from the
//! current directory.
//!
//! Invokes the configured resolver script in a child [`Command`] with [`CFG_USER_TOKEN`] and validates its output URL.

#[cfg(test)]
mod tests;

use crate::{GlobalConfig, invalid};
use serde_json::Value;
use std::{
    io,
    path::PathBuf,
    process::{Command, Stdio},
};

/// Global config key (`CFG_USER_TOKEN_KEY`) supplying the auth token to [`Resolver`].
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

/// The configured custom remote resolver (`resolverPath`) of the workspace scope.
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
    /// Resolve the custom remote [`Resolver`] configured by `scope_json["resolverPath"]`, if any.
    #[inline]
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
        let effective = crate::config::effective(global.clone(), &Value::Null, &Value::Null);
        let token = effective
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

    /// `resolverFunction(scopeName, thisScope.name, token)` on [`Resolver`].
    #[inline]
    pub async fn resolve(&self, scope: &str) -> io::Result<String> {
        let scope = scope.trim();
        if scope.is_empty() || scope.chars().any(char::is_control) {
            return Err(invalid("the remote resolver received an invalid scope"));
        }
        let resolver = self.clone();
        let scope = scope.to_string();
        tokio::task::spawn_blocking(move || resolver.run(&scope)).await.map_err(io::Error::other)?
    }

    /// Spawns `self.node` synchronously to execute [`SCRIPT`] for `scope` with [`RESOLVER_MODULE`] and returns the trimmed URL.
    #[inline]
    fn run(&self, scope: &str) -> io::Result<String> {
        let node = if self.node
            .to_string_lossy()
            .trim()
            .is_empty()
        {
            std::path::Path::new("node")
        } else {
            &self.node
        };
        let output = Command::new(node)
            .args(["-e", SCRIPT, &self.path, scope, &self.this_scope])
            .arg(self.token.as_deref().unwrap_or_default())
            .arg(&self.bit_dir)
            .arg(RESOLVER_MODULE)
            .stdin(Stdio::null())
            .output()?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let message = stderr.trim();
            if !message.is_empty() {
                return Err(io::Error::other(message.to_string()));
            }
            let stdout = String::from_utf8_lossy(&output.stdout);
            return Err(io::Error::other(stdout.trim().to_string()));
        }
        String::from_utf8(output.stdout)
            .ok()
            .map(|url| url.trim().to_string())
            .filter(|url| !url.is_empty() && url != "undefined")
            .ok_or_else(|| invalid("the remote resolver returned an invalid URL"))
    }
}
