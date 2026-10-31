//! Facts about the Node.js CLI that dependency detection depends on: the
//! built-in modules of the Node it runs on, and the TypeScript version its
//! import lookups bundle.

use super::super::{
    cache::{cache_root, hex},
    js::decline,
};
use crate::discovery::{self, NodeCli, Target};
use sha1::{Digest, Sha1};
use std::{
    env, fs, io,
    path::{Path, PathBuf},
    process::Command,
    time::UNIX_EPOCH,
};

const BUILTINS_SCRIPT: &str =
    "process.stdout.write(JSON.stringify(require('module').builtinModules))";

pub struct Node {
    cli: NodeCli,
}

impl Node {
    pub fn find() -> io::Result<Self> {
        match discovery::find()? {
            Target::Entry(cli) if cli.bit_dir.is_some() => Ok(Self { cli }),
            _ => Err(decline("status needs the Node.js CLI's own Node")),
        }
    }

    /// `builtinNames`: `builtinModules`, each also with the `node:` prefix.
    /// Node is asked once per binary; the answer is cached by path, size and time.
    pub fn builtins(&self) -> io::Result<Vec<String>> {
        let binary = self.binary()?;
        let metadata = fs::metadata(&binary)?;
        let modified = metadata
            .modified()?
            .duration_since(UNIX_EPOCH)
            .map_err(io::Error::other)?;
        let key = format!("{}\n{}\n{}", binary.display(), metadata.len(), modified.as_nanos());
        let digest = hex(&Sha1::digest(key.as_bytes()));
        let cached = cache_root()
            .join("native-cli")
            .join(format!("node-builtins-{digest}.json"));
        if let Some(names) = fs::read(&cached)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        {
            return Ok(names);
        }
        let output = Command::new(&binary)
            .arg("-e")
            .arg(BUILTINS_SCRIPT)
            .output()?;
        if !output.status.success() {
            return Err(decline("node builtinModules"));
        }
        let modules: Vec<String> =
            serde_json::from_slice(&output.stdout).map_err(io::Error::other)?;
        let names = builtin_names(&modules);
        let _ = write_atomic(&cached, &serde_json::to_vec(&names)?);
        Ok(names)
    }

    /// The Node binary, resolved through `PATH` when discovery left it bare.
    fn binary(&self) -> io::Result<PathBuf> {
        let node = &self.cli.node;
        if node.is_absolute() {
            return Ok(node.clone());
        }
        let names: &[&str] = if cfg!(windows) { &["node.exe", "node"] } else { &["node"] };
        env::var_os("PATH")
            .and_then(|path| {
                env::split_paths(&path)
                    .find_map(|dir| {
                        names
                            .iter()
                            .map(|name| dir.join(name))
                            .find(|candidate| candidate.is_file())
                    })
            })
            .ok_or_else(|| decline("node is not on PATH"))
    }

    /// `typescript/package.json` as `@teambit/typescript.deps-lookups.lookup-typescript`
    /// resolves it from the `@teambit/bit` package.
    pub fn typescript_version(&self) -> io::Result<Option<String>> {
        let Some(bit_dir) = &self.cli.bit_dir else { return Ok(None) };
        let from = fs::canonicalize(bit_dir)?.join("dist");
        let Some(lookup) =
            resolve_package(&from, "@teambit/typescript.deps-lookups.lookup-typescript")
        else {
            return Ok(None);
        };
        let lookup = fs::canonicalize(lookup)?;
        let Some(typescript) = resolve_package(&lookup, "typescript") else { return Ok(None) };
        let manifest: serde_json::Value =
            bit_object_import::parse_jsonc(&fs::read(typescript.join("package.json"))?)
                .map_err(io::Error::other)?;
        Ok(manifest
            .get("version")
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|version| !version.is_empty())
            .map(str::to_string))
    }
}

/// Node's `node_modules` lookup: the closest `<ancestor>/node_modules/<name>`.
fn resolve_package(from: &Path, name: &str) -> Option<PathBuf> {
    let name = name.trim();
    if name.is_empty() {
        return None;
    }
    from.ancestors()
        .map(|dir| dir.join("node_modules").join(name))
        .find(|dir| dir.join("package.json").is_file())
}

fn builtin_names(modules: &[String]) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    for raw_module in modules {
        let module = raw_module.trim();
        if !module.is_empty() {
            push_module_forms(&mut names, module);
        }
    }
    names
}

fn push_module_forms(names: &mut Vec<String>, module: &str) {
    let bare = module.strip_prefix("node:").map_or(module, str::trim);
    if bare.is_empty() {
        return;
    }
    let forms = if module.starts_with("node:") {
        vec![format!("node:{bare}")]
    } else {
        vec![bare.to_owned(), format!("node:{bare}")]
    };
    for form in forms {
        if !names.contains(&form) {
            names.push(form);
        }
    }
}

fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let parent = path.parent().ok_or_else(|| decline("cache path"))?;
    fs::create_dir_all(parent)?;
    let serial = COUNTER.fetch_add(1, Ordering::Relaxed);
    let temporary = parent.join(format!(".{}-{serial}.tmp", std::process::id()));
    fs::write(&temporary, bytes)?;
    fs::rename(&temporary, path)
}
