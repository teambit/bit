//! Nearest package manifests, shared read caching and core-aspect metadata.
use super::{
    super::data::id_from_object, BIT_ASPECT, ComponentId, Resolved, ResolvedComponent, Resolver,
};
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

impl Resolver<'_> {
    /// `resolvePackagePath` from the component dir, then `resolvePackageData`.
    pub fn package(&mut self, from: &Path, name: &str) -> io::Result<Resolved> {
        let Some(manifest) = self.find_manifest(from, name)? else {
            return Ok(Resolved::Missing(name.to_owned()));
        };
        Ok(from_manifest(&manifest, name))
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

    /// Core-aspect grouping and path order used by the dependency-tree producer.
    pub(in crate::dependencies) fn core_metadata(
        &mut self,
        from: &Path,
        name: &str,
    ) -> io::Result<(bool, PathBuf)> {
        for directory in from.ancestors() {
            let package = directory.join("node_modules").join(name);
            if let Some(manifest) = self.read(&package.join("package.json"))? {
                let is_component =
                    manifest["componentId"].is_object() || manifest["componentId"].is_string();
                return Ok((is_component, package));
            }
        }
        Ok((false, from.join("node_modules").join(name)))
    }

    pub(super) fn read(&mut self, path: &Path) -> io::Result<Option<Value>> {
        if let Some(cached) = self.manifests.get(path) {
            return Ok(cached.clone());
        }
        let manifest = match fs::read(path) {
            Ok(bytes) => bit_object_import::parse_jsonc(&bytes).ok(),
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

/// `resolvePackageData` of a found `package.json`: a component, a package with its
/// version, or missing (`name` is the specifier's package name).
/// The `@teambit/bit` component package as its core aspect; any other resolution as is.
pub(super) fn bit_aspect(resolved: Resolved) -> Resolved {
    match resolved {
        Resolved::Component(found) if found.package_name == BIT_ASPECT.1 => {
            Resolved::CoreAspect(BIT_ASPECT.0.to_owned())
        }
        other => other,
    }
}

pub(super) fn from_manifest(manifest: &Value, name: &str) -> Resolved {
    let Some(package_name) = manifest["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
    else {
        return Resolved::Missing(name.to_owned());
    };
    let concrete = manifest["version"]
        .as_str()
        .map(str::trim)
        .filter(|ver| !ver.is_empty())
        .map(str::to_owned);
    if manifest["componentId"].is_object() || manifest["componentId"].is_string() {
        return Resolved::Component(component_package(manifest, package_name, concrete));
    }
    match concrete {
        Some(version) => Resolved::Package { name: package_name.to_owned(), version },
        None => Resolved::Missing(name.to_owned()),
    }
}

fn component_package(
    manifest: &Value,
    package_name: &str,
    concrete: Option<String>,
) -> ResolvedComponent {
    let mut object = manifest["componentId"].clone();
    let mut id = id_from_object(&object)
        .unwrap_or_else(|| ComponentId {
            scope: None,
            default_scope: None,
            name: package_name.to_owned(),
            version: None,
        });
    let scope = id.scope
        .clone()
        .or_else(|| object["scope"].as_str().map(str::to_owned));
    if manifest["exported"] == Value::Bool(false) {
        id.scope = None;
        object["scope"] = Value::Null;
    }
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
        .map(str::trim)
        .filter(|range| !range.is_empty())
    else {
        return Some("*".to_owned());
    };
    if !["~", "^", ">="].contains(&default) {
        return Some(default.to_owned());
    }
    let concrete = concrete.map(str::trim).unwrap_or_default();
    Some(if node_semver::Version::parse(concrete).is_ok() {
        format!("{default}{concrete}")
    } else {
        format!("{default}0.0.0-{concrete}")
    })
}

pub(super) fn package_main(directory: &Path) -> Option<String> {
    let bytes = fs::read(directory.join("package.json")).ok()?;
    let manifest = bit_object_import::parse_jsonc(&bytes).ok()?;
    manifest["main"]
        .as_str()
        .map(str::trim)
        .filter(|main| !main.is_empty())
        .map(str::to_owned)
}
