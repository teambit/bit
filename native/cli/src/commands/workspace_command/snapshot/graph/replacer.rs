//! `createFileVersionReplacer`: pnpm locks a workspace component as a
//! directory dependency (`<package>@file:<dir>`); the graph names it by the
//! component's version instead, as `snapToSemver` writes it.
//!
//! [`Replacer`] and [`WorkspaceComponent`] match `file:` specifiers with [`Regex`] and replace them using [`HashMap`] version tables.

#[cfg(test)]
mod replacer_tests;

use crate::commands::status::js::decline;
use regress::Regex;
use std::{collections::HashMap, io};

/// Semver prefix (`SNAP_VERSION_PREFIX`) prepended to snap hashes in lockfile graphs.
const SNAP_PREFIX: &str = "0.0.0-";

/// One workspace component: its package, id and version.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceComponent<'c> {
    pub package_name: &'c str,
    /// `scope/name`.
    pub identity: &'c str,
    /// The version it has once the snap is written: the new hash for the
    /// snapped components, `None` for a new component.
    pub version: Option<&'c str>,
}

#[derive(Debug, Default, Clone)]
pub struct Replacer {
    /// `(name1|name2)@file:[^'"(]+`, global.
    pattern: Option<Regex>,
    /// Package name → `name@<semver>`.
    replacements: HashMap<String, String>,
    /// Package name → `{ name, scope }`.
    components: HashMap<String, (String, String)>,
}

impl Replacer {
    /// `componentIdByPkgName`, in insertion order: the snapped components,
    /// then the others.
    pub fn new(components: &[WorkspaceComponent<'_>]) -> io::Result<Self> {
        let mut replacements = HashMap::with_capacity(components.len());
        let mut ids = HashMap::with_capacity(components.len());
        let mut escaped = Vec::with_capacity(components.len());
        for component in components {
            let package_name = component.package_name.trim();
            if package_name.is_empty() {
                return Err(decline("dependency graph package name"));
            }
            // `snapToSemver(undefined)` is `undefined`: a new component is
            // named `<package>@undefined`, as in Node.
            let version = component.version.map_or_else(|| "undefined".to_string(), snap_to_semver);
            replacements.insert(package_name.to_string(), format!("{package_name}@{version}"));
            let (scope, name) = component.identity
                .trim()
                .split_once('/')
                .map(|(scope, name)| (scope.trim(), name.trim()))
                .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
                .ok_or_else(|| decline("dependency graph component id"))?;
            ids.insert(package_name.to_string(), (name.to_string(), scope.to_string()));
            escaped.push(escape(package_name));
        }
        let pattern = (!escaped.is_empty())
            .then(|| {
                let source = format!(r#"({})@file:[^'"(]+"#, escaped.join("|"));
                Regex::new(&source)
                    .map_err(|error| decline(format!("dependency graph pattern: {error}")))
            })
            .transpose()?;
        Ok(Self { pattern, replacements, components: ids })
    }

    /// `replaceFileVersion(s)`.
    #[must_use]
    pub fn replace(&self, text: &str) -> String {
        let Some(pattern) = self.pattern
            .as_ref()
            .filter(|_| text.contains("@file:"))
        else {
            return text.to_string();
        };
        let mut output = String::with_capacity(text.len());
        let mut last = 0;
        for found in pattern.find_iter(text) {
            let Some(name) = found.group(1) else { continue };
            output.push_str(&text[last..found.range.start]);
            output.push_str(&self.replacements[&text[name]]);
            last = found.range.end;
        }
        output.push_str(&text[last..]);
        output
    }

    /// The `{ name, scope }` a workspace component's package is marked with.
    #[must_use]
    #[inline]
    pub fn component(&self, package_name: &str) -> Option<&(String, String)> {
        self.components.get(package_name.trim())
    }

    #[inline]
    pub fn package_names(&self) -> impl Iterator<Item = &str> {
        self.replacements.keys().map(String::as_str)
    }
}

/// `snapToSemver`: a hash (`isHash`: 3 to 40 hexadecimal digits) as a
/// prerelease of `0.0.0`.
#[inline]
fn snap_to_semver(version: &str) -> String {
    let version = version.trim();
    if version.is_empty() {
        return "undefined".to_owned();
    }
    let hash =
        (3..=40).contains(&version.len()) && version.bytes().all(|byte| byte.is_ascii_hexdigit());
    if hash { format!("{SNAP_PREFIX}{version}") } else { version.to_string() }
}

/// `name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`.
#[inline]
fn escape(name: &str) -> String {
    let mut escaped = String::with_capacity(name.len());
    for character in name.chars() {
        if r".*+?^${}()|[]\".contains(character) {
            escaped.push('\\');
        }
        escaped.push(character);
    }
    escaped
}
