//! Resolution of one import specifier, as the dependency tree builder and
//! `resolvePackageData` classify it: a file, a package, a component package or missing.

use super::{builtins, data::id_from_object};
use crate::{
    host::CoreAspect,
    model::{ComponentId, WorkspaceComponent},
};
use serde_json::Value;
use std::{
    collections::HashMap,
    fs, io,
    path::{Component, Path, PathBuf},
};

const EXTENSIONS: [&str; 14] = [
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts", "json", "scss", "sass", "less", "css",
    "mdx",
];

/// The classification of one specifier.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Resolved {
    /// A Node built-in or a specifier that never names a dependency.
    Ignored,
    /// A file of the importing component.
    Internal,
    /// A file of another workspace component (a relative cross-component import).
    OtherComponent(ComponentId),
    /// A package that is a Bit core aspect: its aspect id.
    CoreAspect(String),
    /// A plain package and its concrete version.
    Package { name: String, version: String },
    /// A component package.
    Component(ResolvedComponent),
    /// A package that is not installed.
    Missing(String),
}

/// A component found through its package (`ResolvedPackageData` with `componentId`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedComponent {
    pub id: ComponentId,
    pub package_name: String,
    /// `concreteVersion`.
    pub version: Option<String>,
    /// The package is marked `bit.peer`: its peer range.
    pub peer_range: Option<String>,
}

/// Resolves specifiers of the components of one workspace, caching `package.json` reads.
pub struct Resolver<'a> {
    pub components: &'a [WorkspaceComponent],
    pub core_aspects: &'a [CoreAspect],
    manifests: HashMap<PathBuf, Option<Value>>,
}

impl<'a> Resolver<'a> {
    #[must_use]
    pub fn new(components: &'a [WorkspaceComponent], core_aspects: &'a [CoreAspect]) -> Self {
        Self { components, core_aspects, manifests: HashMap::new() }
    }

    /// Classify `specifier` imported from `file` (relative to the component dir).
    pub fn resolve(
        &mut self,
        component: &WorkspaceComponent,
        file: &str,
        specifier: &str,
    ) -> io::Result<Resolved> {
        if specifier.starts_with('.') || specifier.starts_with('/') {
            return Ok(self.relative(component, file, specifier));
        }
        if builtins::is_builtin(specifier) || specifier.starts_with('#') || specifier.contains(':')
        {
            return Ok(Resolved::Ignored);
        }
        let name = package_name(specifier);
        if let Some(aspect) = self.core_aspects
            .iter()
            .find(|aspect| aspect.package_name == name)
        {
            return Ok(Resolved::CoreAspect(aspect.id.clone()));
        }
        let resolved = self.package(&component.dir, &name)?;
        if matches!(resolved, Resolved::Missing(_)) {
            return Ok(self.unlinked(&name).unwrap_or(resolved));
        }
        Ok(resolved)
    }

    /// A workspace component whose package is not linked into `node_modules` yet
    /// (a fresh workspace before its first install). Once linked, the package's
    /// `componentId` resolves to this same component.
    fn unlinked(&self, name: &str) -> Option<Resolved> {
        let component = self.components
            .iter()
            .find(|component| component.package_name == name)?;
        Some(Resolved::Component(ResolvedComponent {
            id: component.id.clone(),
            package_name: name.to_owned(),
            version: component.id.version.clone(),
            peer_range: None,
        }))
    }

    fn relative(&self, component: &WorkspaceComponent, file: &str, specifier: &str) -> Resolved {
        let origin = component.dir.join(file);
        let base = origin.parent().unwrap_or(&component.dir);
        let Some(target) = find_file(&normalize(&base.join(specifier))) else {
            return Resolved::Ignored;
        };
        if target.starts_with(&component.dir) {
            return Resolved::Internal;
        }
        self.components
            .iter()
            .filter(|other| target.starts_with(&other.dir) && other.root_dir != ".")
            .max_by_key(|other| other.dir.as_os_str().len())
            .map_or(Resolved::Ignored, |other| Resolved::OtherComponent(other.id.clone()))
    }

    /// `resolvePackagePath` from the component dir, then `resolvePackageData`.
    pub fn package(&mut self, from: &Path, name: &str) -> io::Result<Resolved> {
        let Some(manifest) = self.find_manifest(from, name)? else {
            return Ok(Resolved::Missing(name.to_owned()));
        };
        let Some(package_name) = manifest["name"]
            .as_str()
            .filter(|name| !name.is_empty())
        else {
            return Ok(Resolved::Missing(name.to_owned()));
        };
        let concrete = manifest["version"].as_str().map(str::to_owned);
        if manifest["componentId"].is_object() {
            return Ok(Resolved::Component(component_package(&manifest, package_name, concrete)));
        }
        Ok(match concrete {
            Some(version) => Resolved::Package { name: package_name.to_owned(), version },
            None => Resolved::Missing(name.to_owned()),
        })
    }

    /// The `package.json` of `node_modules/<name>` closest to `from`.
    pub fn find_manifest(&mut self, from: &Path, name: &str) -> io::Result<Option<Value>> {
        for dir in from.ancestors() {
            let path = dir
                .join("node_modules")
                .join(name)
                .join("package.json");
            if let Some(manifest) = self.read(&path)? {
                return Ok(Some(manifest));
            }
        }
        Ok(None)
    }

    fn read(&mut self, path: &Path) -> io::Result<Option<Value>> {
        if let Some(cached) = self.manifests.get(path) {
            return Ok(cached.clone());
        }
        let manifest = match fs::read(path) {
            Ok(bytes) => serde_json::from_slice(&bytes).ok(),
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::NotFound | io::ErrorKind::NotADirectory,
                ) =>
            {
                None
            }
            Err(error) => return Err(error),
        };
        self.manifests.insert(path.to_path_buf(), manifest.clone());
        Ok(manifest)
    }
}

fn component_package(
    manifest: &Value,
    package_name: &str,
    concrete: Option<String>,
) -> ResolvedComponent {
    let mut object = manifest["componentId"].clone();
    let scope = object["scope"].as_str().map(str::to_owned);
    if manifest["exported"] == Value::Bool(false) {
        object["scope"] = Value::Null;
    }
    let mut id = id_from_object(&object)
        .unwrap_or_else(|| ComponentId {
            scope: None,
            default_scope: None,
            name: package_name.to_owned(),
            version: None,
        });
    if id.scope.is_none() {
        id.default_scope = scope;
    }
    let version =
        if id.version.is_some() && concrete.is_some() { id.version.clone() } else { concrete };
    ResolvedComponent {
        peer_range: peer_range(manifest, version.as_deref()),
        id,
        package_name: package_name.to_owned(),
        version,
    }
}

fn peer_range(manifest: &Value, concrete: Option<&str>) -> Option<String> {
    let bit = &manifest["bit"];
    if !bit["peer"].as_bool().unwrap_or(false) {
        return None;
    }
    let Some(default) = bit["defaultPeerRange"]
        .as_str()
        .filter(|range| !range.is_empty())
    else {
        return Some("*".to_owned());
    };
    if !["~", "^", ">="].contains(&default) {
        return Some(default.to_owned());
    }
    let concrete = concrete.unwrap_or_default();
    Some(if node_semver::Version::parse(concrete).is_ok() {
        format!("{default}{concrete}")
    } else {
        format!("{default}0.0.0-{concrete}")
    })
}

/// `resolvePackageNameByPath`: `@scope/name` or `name` of a specifier.
#[must_use]
pub fn package_name(specifier: &str) -> String {
    let mut parts = specifier.split('/');
    match (parts.next(), parts.next()) {
        (Some(scope), Some(name)) if scope.starts_with('@') => format!("{scope}/{name}"),
        (Some(name), _) => name.to_owned(),
        _ => specifier.to_owned(),
    }
}

fn find_file(target: &Path) -> Option<PathBuf> {
    if target.is_file() {
        return Some(target.to_path_buf());
    }
    let stem = strip_script_extension(target);
    let with_extension = |base: &Path| {
        EXTENSIONS
            .iter()
            .map(|extension| PathBuf::from(format!("{}.{extension}", base.display())))
            .find(|candidate| candidate.is_file())
    };
    with_extension(target)
        .or_else(|| stem.as_deref().and_then(with_extension))
        .or_else(|| with_extension(&target.join("index")))
        .or_else(|| target.is_dir().then(|| target.to_path_buf()))
}

/// `./file.js` may name `./file.ts`.
fn strip_script_extension(target: &Path) -> Option<PathBuf> {
    let extension = target.extension()?.to_str()?;
    ["js", "jsx", "mjs", "cjs"]
        .contains(&extension)
        .then(|| target.with_extension(""))
}

fn normalize(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for part in path.components() {
        match part {
            Component::ParentDir => {
                result.pop();
            }
            Component::CurDir => {}
            other => result.push(other),
        }
    }
    result
}
