//! Resolution of one import specifier, as the dependency tree builder and
//! `resolvePackageData` classify it: a file, a package, a component package or missing.
//!
//! Relative imports follow Bit's `filing-cabinet` lookups: TypeScript origins try
//! TypeScript's module resolution first (`.ts`, `.tsx`, `.d.ts`, a `.js` import
//! naming a `.ts` file, directory `index` files), then the `CommonJS` lookup;
//! other origins use the `CommonJS` lookup, `resolve.sync` with Bit's extension list.

mod manifests;

use super::builtins;
use crate::{
    host::CoreAspect,
    model::{ComponentId, WorkspaceComponent},
};
use manifests::{bit_aspect, from_manifest, package_main};
use serde_json::Value;
use std::{
    collections::HashMap,
    io,
    path::{Component, Path, PathBuf},
};

/// `resolveExtensions` of `lookup-typescript`, in lookup order.
const COMMONJS_EXTENSIONS: [&str; 15] = [
    "js", "json", "cjs", "mjs", "jsx", "ts", "tsx", "cts", "mts", "d.ts", "css", "scss", "sass",
    "styl", "less",
];
/// What `ts.resolveModuleName` tries for a relative import.
const TYPESCRIPT_EXTENSIONS: [&str; 3] = ["ts", "tsx", "d.ts"];
/// Origin files `filing-cabinet` resolves through TypeScript.
const TYPESCRIPT_ORIGINS: [&str; 6] = ["ts", "tsx", "cts", "mts", "md", "mdx"];
/// The extensions `filing-cabinet` has a default lookup for (`defaultLookups`).
const DEFAULT_LOOKUPS: [&str; 14] = [
    "js", "cjs", "mjs", "jsx", "ts", "tsx", "cts", "mts", "scss", "sass", "styl", "less", "md",
    "mdx",
];

/// `teambit.harmony/bit` and its package: a core aspect to `processCoreAspects`
/// (`getCoreAspectsPackagesAndIds`), though the install never links it.
const BIT_ASPECT: (&str, &str) = ("teambit.harmony/bit", "@teambit/bit");

/// The classification of one specifier.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Resolved {
    /// A Node built-in or a specifier that never names a dependency.
    Ignored,
    /// A file of the importing component.
    Internal,
    /// A file of another workspace component (a relative cross-component import).
    OtherComponent(ComponentId),
    /// A relative import naming no file (`MissingDependenciesOnFs`): the specifier.
    MissingFile(String),
    /// A relative import of a file no component tracks (`UntrackedDependencies`):
    /// the path relative to the workspace root.
    Untracked(String),
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
    pub root: &'a Path,
    pub components: &'a [WorkspaceComponent],
    pub core_aspects: &'a [CoreAspect],
    manifests: HashMap<PathBuf, Option<Value>>,
}

impl<'a> Resolver<'a> {
    #[must_use]
    pub fn new(
        root: &'a Path,
        components: &'a [WorkspaceComponent],
        core_aspects: &'a [CoreAspect],
    ) -> Self {
        Self { root, components, core_aspects, manifests: HashMap::new() }
    }

    /// Classify `specifier` imported from `file` (relative to the component dir).
    pub fn resolve(
        &mut self,
        component: &WorkspaceComponent,
        file: &str,
        specifier: &str,
    ) -> io::Result<Resolved> {
        self.resolve_from(component, file, specifier, false)
    }

    /// [`Self::resolve`], with `typescript` forcing the TypeScript lookup of a
    /// relative import whatever the extension of `file` (a registered detector's).
    pub fn resolve_from(
        &mut self,
        component: &WorkspaceComponent,
        file: &str,
        specifier: &str,
        typescript: bool,
    ) -> io::Result<Resolved> {
        let specifier = specifier.trim();
        if specifier.is_empty() {
            return Ok(Resolved::Ignored);
        }
        if specifier.starts_with('.') || specifier.starts_with('/') {
            return Ok(self.relative(component, file, specifier, typescript));
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
        Ok(match self.package(&component.dir, &name)? {
            Resolved::Missing(_) if let Some(unlinked) = self.unlinked(&name) => unlinked,
            resolved => bit_aspect(resolved),
        })
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

    fn relative(
        &self,
        component: &WorkspaceComponent,
        file: &str,
        specifier: &str,
        typescript: bool,
    ) -> Resolved {
        let origin = component.dir.join(file);
        let base = origin.parent().unwrap_or(&component.dir);
        let typescript = typescript || is_typescript_origin(&origin);
        let Some(target) = find_file(&normalize(&base.join(specifier)), typescript) else {
            return Resolved::MissingFile(specifier.to_owned());
        };
        self.file(component, &target)
    }

    /// A file a dependency resolved to: the importing component's, another
    /// component's, or one no component tracks.
    fn file(&self, component: &WorkspaceComponent, target: &Path) -> Resolved {
        // The owner is the deepest component containing the file (`getComponentIdByPath`);
        // the workspace-root component (`rootDir "."`) owns no other component's files.
        let owner = self.components
            .iter()
            .filter(|other| target.starts_with(&other.dir) && other.root_dir != ".")
            .max_by_key(|other| other.dir.as_os_str().len());
        match owner {
            Some(owner) if owner.id == component.id => Resolved::Internal,
            Some(owner) => Resolved::OtherComponent(owner.id.clone()),
            None => Resolved::Untracked(workspace_relative(self.root, target)),
        }
    }

    /// Classify `specifier` imported from `file` by what a custom detector's
    /// `dependencyLookup` returned (`cabinet()` in `dependency-tree`):
    /// - an existing path is a dependency path (`groupDependencyList`): under
    ///   `node_modules` the package containing it (`resolvePackageData`), else a file;
    /// - nothing makes `filing-cabinet` retry with the default lookup of the
    ///   specifier's extension when that differs from the file's;
    /// - otherwise the specifier does not exist: a relative one is a missing file,
    ///   a package is looked up by name (`MissingHandler`).
    pub fn looked_up(
        &mut self,
        component: &WorkspaceComponent,
        file: &str,
        specifier: &str,
        result: Option<&Path>,
    ) -> io::Result<Resolved> {
        if let Some(path) = result.filter(|path| path.exists()) {
            return self.dependency_path(component, &normalize(path));
        }
        if !(specifier.starts_with('.') || specifier.starts_with('/')) {
            return self.resolve_from(component, file, specifier, false);
        }
        let extension = |path: &str| {
            Path::new(path)
                .extension()
                .and_then(|extension| extension.to_str())
                .map(str::to_owned)
        };
        let retry = result.is_none()
            && extension(specifier)
                .is_some_and(|dependency| {
                    Some(&dependency) != extension(file).as_ref()
                        && DEFAULT_LOOKUPS.contains(&dependency.as_str())
                });
        if !retry {
            return Ok(Resolved::MissingFile(specifier.to_owned()));
        }
        let origin = component.dir.join(file);
        let base = origin.parent().unwrap_or(&component.dir);
        let target = normalize(&base.join(specifier));
        Ok(match find_file(&target, is_typescript_origin(&target)) {
            Some(target) => self.file(component, &target),
            None => Resolved::MissingFile(specifier.to_owned()),
        })
    }

    /// `groupDependencyList` for one existing path.
    fn dependency_path(
        &mut self,
        component: &WorkspaceComponent,
        target: &Path,
    ) -> io::Result<Resolved> {
        let relative = target.strip_prefix(&component.dir).unwrap_or(target);
        let parts: Vec<String> = relative
            .components()
            .map(|part| {
                part.as_os_str()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        let Some(index) = parts
            .iter()
            .rposition(|part| part == "node_modules")
        else {
            return Ok(self.file(component, target));
        };
        // `resolvePackageDirFromFilePath`: the last `node_modules` and the package name.
        let name = package_name(&parts[index + 1..].join("/"));
        let dir = target
            .ancestors()
            .find(|dir| dir.ends_with("node_modules"))
            .unwrap_or(target)
            .join(&name);
        let Some(manifest) = self.read(&dir.join("package.json"))? else {
            // `unidentifiedPackages`: a package without a `package.json`.
            return Ok(Resolved::Ignored);
        };
        if let Some(aspect) = manifest["name"]
            .as_str()
            .and_then(|name| {
                self.core_aspects
                    .iter()
                    .find(|aspect| aspect.package_name == name)
            })
        {
            return Ok(Resolved::CoreAspect(aspect.id.clone()));
        }
        Ok(match from_manifest(&manifest, &name) {
            Resolved::Missing(_) => Resolved::Ignored,
            other => bit_aspect(other),
        })
    }
}

/// An origin file `filing-cabinet` resolves through TypeScript.
fn is_typescript_origin(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| TYPESCRIPT_ORIGINS.contains(&extension))
}

/// `resolvePackageNameByPath`: `@scope/name` or `name` of a specifier.
#[must_use]
pub fn package_name(specifier: &str) -> String {
    let specifier = specifier.trim();
    let mut parts = specifier.split('/');
    match (parts.next(), parts.next()) {
        (Some(scope), Some(name)) if scope.starts_with('@') => {
            format!("{}/{}", scope.trim(), name.trim())
        }
        (Some(name), _) => name.trim().to_owned(),
        _ => specifier.to_owned(),
    }
}

/// `path.relative(workspace, file)`, `/`-separated; a file outside the workspace
/// keeps its `..` prefix.
fn workspace_relative(root: &Path, target: &Path) -> String {
    let mut ancestor = root;
    let mut up = PathBuf::new();
    while !target.starts_with(ancestor) {
        let Some(parent) = ancestor.parent() else { break };
        up.push("..");
        ancestor = parent;
    }
    let relative = up.join(target.strip_prefix(ancestor).unwrap_or(target));
    relative.to_string_lossy().replace('\\', "/")
}

/// The file a relative specifier names, or `None` when it is missing.
fn find_file(target: &Path, typescript: bool) -> Option<PathBuf> {
    if target.is_file() {
        return Some(target.to_path_buf());
    }
    if typescript && let Some(found) = typescript_lookup(target) {
        return Some(found);
    }
    commonjs_lookup(target)
}

/// `ts.resolveModuleName`: `./x` and `./x.js` name `x.ts`/`x.tsx`/`x.d.ts`, a
/// directory its `index` file.
fn typescript_lookup(target: &Path) -> Option<PathBuf> {
    let stem = strip_script_extension(target);
    let stem = stem.as_deref().unwrap_or(target);
    with_extensions(stem, &TYPESCRIPT_EXTENSIONS)
        .or_else(|| with_extensions(&target.join("index"), &TYPESCRIPT_EXTENSIONS))
}

/// `resolve.sync` with Bit's `resolveExtensions`: the file with an extension
/// appended, else a directory's `package.json` `main`, else its `index` file.
fn commonjs_lookup(target: &Path) -> Option<PathBuf> {
    if let Some(found) = with_extensions(target, &COMMONJS_EXTENSIONS) {
        return Some(found);
    }
    if !target.is_dir() {
        return None;
    }
    package_main(target)
        .and_then(|main| find_file(&normalize(&target.join(main)), false))
        .or_else(|| with_extensions(&target.join("index"), &COMMONJS_EXTENSIONS))
}

fn with_extensions(base: &Path, extensions: &[&str]) -> Option<PathBuf> {
    extensions
        .iter()
        .map(|extension| PathBuf::from(format!("{}.{extension}", base.display())))
        .find(|candidate| candidate.is_file())
}

/// `./file.js` may name `./file.ts` (TypeScript's extension substitution).
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
