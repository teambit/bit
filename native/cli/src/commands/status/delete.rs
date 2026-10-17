//! Read-only dependency capture for lane deletion; no status cache is published.

use super::{
    capture,
    js::{array, decline},
};
use crate::commands::engine::Engine;
use bit_object_import::component_delete::DependencyComponent;
use serde_json::{Value, json};
use std::{
    env, fs, io,
    path::{Path, PathBuf},
};

pub(crate) struct DeleteGraph {
    engine: Engine,
    controls: Vec<(PathBuf, Vec<u8>)>,
    read_set: Vec<Value>,
    pub(crate) components: Vec<DependencyComponent>,
}
impl DeleteGraph {
    pub(crate) fn read(root: &Path) -> io::Result<Self> {
        let controls = [".bitmap", "workspace.jsonc", ".bit/index.json", ".bit/scope.json"]
            .iter()
            .map(|name| {
                let path = root.join(name);
                fs::read(&path).map(|bytes| (path, bytes))
            })
            .collect::<io::Result<Vec<_>>>()?;
        let home =
            env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap_or_default();
        let mut engine = Engine::new()?;
        let context: Value = engine.request(
            &json!({"kind":"statusContext", "root":root, "home":Path::new(&home), "history":false}),
        )?;
        let targets = array(context.get("targets"), "lane deletion targets")?;
        let captured = capture::capture_with(
            &mut engine,
            root,
            Path::new(&home),
            &context,
            targets,
            capture::CaptureOptions { reset: true, ..Default::default() },
        )?;
        let read_set = captured.dependency_read_set();
        let components = captured.components
            .into_iter()
            .map(|component| DependencyComponent {
                identity: component.identity,
                package_name: component.package_name,
                dependencies: component.dependencies,
            })
            .collect();
        Ok(Self { engine, controls, read_set, components })
    }
    pub(crate) fn validate(&mut self) -> io::Result<()> {
        for (path, before) in &self.controls {
            if fs::read(path)? != *before {
                return Err(decline("lane dependency controls changed before deletion"));
            }
        }
        let result: Value = self.engine.request(
            &json!({"kind":"dependencyFreshValidate", "readSet":self.read_set}),
        )?;
        if result["fresh"] != true {
            return Err(decline("lane dependencies changed before deletion"));
        }
        Ok(())
    }
}
