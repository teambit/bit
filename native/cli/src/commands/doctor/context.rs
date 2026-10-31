//! Diagnostic environment facts and effective configuration.
use super::vendors;
use crate::discovery::{self, NodeCli, Target};
use serde_json::{Value, json};
use std::{
    env, fs, io,
    path::{Path, PathBuf},
};
pub(super) struct Context {
    pub root: PathBuf,
    pub scope: Option<PathBuf>,
    pub config: Value,
    pub cli: NodeCli,
    pub timestamp: i64,
}
impl Context {
    pub fn load() -> io::Result<Self> {
        let cwd = env::current_dir()?;
        let root = bit_workspace_config::workspace_root(&cwd).unwrap_or(cwd);
        let scope = scope(&root);
        let global =
            bit_workspace_config::read_global_config(&bit_workspace_config::global_config_dir())?;
        let scope_config = scope
            .as_ref()
            .map(|scope| optional_json(&scope.join("scope.json")))
            .transpose()?
            .unwrap_or(Value::Null);
        let workspace = optional_json(&root.join("workspace.jsonc"))?;
        let config = Value::Object(bit_workspace_config::effective(
            &global,
            &scope_config["config"],
            &Value::Object(bit_workspace_config::workspace_values(&workspace)),
            &["git_path", "user.name", "user.email"],
        ));
        let Target::Entry(cli) = discovery::find()? else {
            return Err(io::Error::other("doctor requires a published Bit installation"));
        };
        Ok(Self { root, scope, config, cli, timestamp: chrono::Utc::now().timestamp_millis() })
    }
    pub fn metadata(&self) -> io::Result<Value> {
        let bit_dir =
            self.cli.bit_dir.as_ref().ok_or_else(|| io::Error::other("missing Bit package"))?;
        let package: Value =
            bit_object_import::parse_jsonc(&fs::read(bit_dir.join("package.json"))?)
                .map_err(io::Error::other)?;
        let node = std::process::Command::new(&self.cli.node).arg("--version").output()?;
        let platform = match env::consts::OS {
            "windows" => "win32",
            other => other,
        };
        Ok(json!({"nodeVersion":String::from_utf8(node.stdout).map_err(io::Error::other)?.trim(),
            "runningTimestamp":self.timestamp,"platform":platform,"bitVersion":package["version"],
            "npmVersion":vendors::version("npm","--version",true),"yarnVersion":vendors::version("yarn","-v",false),
            "userDetails":format!("{}<{}>",self.setting("user.name",""),self.setting("user.email",""))}))
    }
    pub fn setting<'a>(&'a self, key: &str, default: &'a str) -> &'a str {
        self.config[key.trim()]
            .as_str()
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .unwrap_or(default)
    }
}
fn scope(root: &Path) -> Option<PathBuf> {
    let scope = bit_workspace_config::scope_path(root);
    if scope.join("scope.json").is_file() {
        Some(scope)
    } else {
        root.ancestors()
            .find(|path| path.join("scope.json").is_file())
            .map(Path::to_path_buf)
    }
}
pub(super) fn optional_json(path: &Path) -> io::Result<Value> {
    match fs::read(path) {
        Ok(bytes) => bit_workspace_config::parse_jsonc(&bytes),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Value::Null),
        Err(error) => Err(error),
    }
}
