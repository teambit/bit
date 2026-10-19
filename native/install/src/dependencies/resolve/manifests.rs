//! Nearest package manifests, shared read caching and core-aspect metadata.
use super::{Resolved, Resolver, from_manifest};
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
                return Ok((manifest["componentId"].is_object(), package));
            }
        }
        Ok((false, from.join("node_modules").join(name)))
    }

    pub(super) fn read(&mut self, path: &Path) -> io::Result<Option<Value>> {
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
