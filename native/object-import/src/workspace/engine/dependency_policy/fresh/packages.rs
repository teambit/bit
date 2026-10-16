use super::{invalid, proof};
use crate::workspace::engine::source_overlay::SourceOverlay;
use serde_json::Value;
use std::{
    collections::HashMap,
    io,
    path::{Path, PathBuf},
};

#[derive(Clone)]
pub(super) struct Package {
    pub(super) name: String,
    pub(super) component: Option<Value>,
    pub(super) concrete: Option<String>,
    pub(super) dependent: Option<String>,
    pub(super) manifest: Value,
    pub(super) directory: PathBuf,
}
pub(super) struct Reader {
    pub(super) proofs: Vec<proof::Proof>,
    dependent: Option<String>,
    packages: HashMap<PathBuf, Package>,
    bytes: usize,
    overlay: Option<SourceOverlay>,
}
impl Reader {
    pub(super) fn new(
        root: &Path,
        proofs: Vec<proof::Proof>,
        overlay: Option<&SourceOverlay>,
    ) -> io::Result<Self> {
        let mut reader = Self {
            proofs,
            dependent: None,
            packages: HashMap::new(),
            bytes: 0,
            overlay: overlay.cloned(),
        };
        for directory in root.ancestors() {
            if let Some(package) = reader.json(&directory.join("package.json"))? {
                reader.dependent = dependent(&package)?;
                break;
            }
        }
        Ok(reader)
    }
    fn json(&mut self, file: &Path) -> io::Result<Option<Value>> {
        let bytes = match &self.overlay {
            Some(view) => view.read(file, &mut self.proofs)?,
            None => proof::read(file, &mut self.proofs)?,
        };
        let Some(bytes) = bytes else { return Ok(None) };
        self.bytes += bytes.len();
        if self.bytes > 32 * 1024 * 1024 {
            return Err(invalid("fresh package byte budget"));
        }
        let value = serde_json::from_slice(&bytes).map_err(io::Error::other)?;
        Ok(Some(value))
    }
    pub(super) fn package(&mut self, resolved: &str) -> io::Result<Package> {
        let directory = directory(resolved)?;
        if let Some(package) = self.packages.get(&directory) {
            return Ok(package.clone());
        }
        let manifest = self
            .json(&directory.join("package.json"))?
            .ok_or_else(|| invalid("fresh unidentified package"))?;
        let name = manifest["name"]
            .as_str()
            .filter(|name| !name.is_empty())
            .ok_or_else(|| invalid("fresh package name"))?
            .to_owned();
        let component = manifest
            .get("componentId")
            .filter(|value| !value.is_null())
            .cloned();
        let concrete = concrete(&manifest, component.as_ref())?;
        let package = Package {
            name,
            component,
            concrete,
            dependent: self.dependent.clone(),
            manifest,
            directory: directory.clone(),
        };
        self.packages.insert(directory, package.clone());
        Ok(package)
    }
    pub(super) fn check_main(
        &mut self,
        package: &Package,
        resolved: &str,
    ) -> io::Result<Option<String>> {
        let resolved = resolved.replace(std::path::MAIN_SEPARATOR, "/");
        let Some(main) = package.manifest["main"]
            .as_str()
            .filter(|main| !main.is_empty())
        else {
            return Ok(None);
        };
        if resolved.ends_with(&main.replacen("./", "", 1))
            || resolved
                .split("node_modules/")
                .nth(1)
                .unwrap_or(&resolved)
                .contains("eslintrc")
        {
            return Ok(None);
        }
        if !matches!(
            Path::new(&resolved).extension().and_then(|ext| ext.to_str()),
            Some("ts" | "tsx" | "js" | "jsx"),
        ) {
            return Ok(None);
        }
        let dist = package.directory.join("dist");
        let exists = match &self.overlay {
            Some(view) => view.metadata(&dist, &mut self.proofs)?.is_some(),
            None => proof::probe(&dist, &mut self.proofs)?,
        };
        if exists {
            return Ok(Some(
                resolved
                    .split("node_modules/")
                    .nth(1)
                    .unwrap_or(&resolved)
                    .to_owned(),
            ));
        }
        Ok(None)
    }
}
fn directory(resolved: &str) -> io::Result<PathBuf> {
    let resolved = resolved.replace(std::path::MAIN_SEPARATOR, "/");
    let offset = resolved.rfind("node_modules/").ok_or_else(|| invalid("fresh package path"))?
        + "node_modules/".len();
    let rest = &resolved[offset..];
    let mut parts = rest.split('/');
    let first = parts
        .next()
        .filter(|part| !part.is_empty())
        .ok_or_else(|| invalid("fresh package spelling"))?;
    let name = if first.starts_with('@') {
        format!(
            "{first}/{}",
            parts
                .next()
                .filter(|part| !part.is_empty())
                .ok_or_else(|| invalid("fresh scoped package"))?,
        )
    } else {
        first.to_owned()
    };
    Ok(PathBuf::from(format!("{}{name}", &resolved[..offset])))
}
fn concrete(package: &Value, component: Option<&Value>) -> io::Result<Option<String>> {
    let mut version = optional(package.get("version"))?;
    if version
        .as_ref()
        .is_some_and(|version| !version.is_empty())
        && let Some(component) = component
        && let Some(id_version) = optional(component.get("version"))?
            .filter(|version| !version.is_empty() && version != "latest")
    {
        version = Some(id_version);
    }
    Ok(version)
}
fn dependent(package: &Value) -> io::Result<Option<String>> {
    // Canonical resolve-pkg-data reads this literal key, not the dependency's dynamic name.
    for field in ["dependencies", "devDependencies", "peerDependencies"] {
        if let Some(version) =
            optional(package[field].get("packageName"))?.filter(|version| !version.is_empty())
        {
            return Ok(Some(version));
        }
    }
    Ok(None)
}
fn optional(value: Option<&Value>) -> io::Result<Option<String>> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => Ok(Some(value.clone())),
        _ => Err(invalid("fresh package version shape")),
    }
}
