//! `createFileVersionReplacer`: pnpm locks a workspace component as a
//! directory dependency (`<package>@file:<dir>`); the graph names it by the
//! component's version instead, as `snapToSemver` writes it.

#[cfg(test)]
mod replacer_tests;

use crate::commands::status::js::decline;
use regress::Regex;
use std::{collections::HashMap, io};

/// `SNAP_VERSION_PREFIX`.
const SNAP_PREFIX: &str = "0.0.0-";

/// One workspace component: its package, id and version.
pub struct WorkspaceComponent<'c> {
    pub package_name: &'c str,
    /// `scope/name`.
    pub identity: &'c str,
    /// The version it has once the snap is written: the new hash for the
    /// snapped components, `None` for a new component.
    pub version: Option<&'c str>,
}

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
        let mut replacements = HashMap::new();
        let mut ids = HashMap::new();
        let mut escaped = Vec::new();
        for component in components {
            // `snapToSemver(undefined)` is `undefined`: a new component is
            // named `<package>@undefined`, as in Node.
            let version = component.version.map_or_else(|| "undefined".to_string(), snap_to_semver);
            replacements.insert(
                component.package_name.to_string(),
                format!("{}@{version}", component.package_name),
            );
            let (scope, name) = component.identity
                .trim()
                .split_once('/')
                .map(|(scope, name)| (scope.trim(), name.trim()))
                .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
                .ok_or_else(|| decline("dependency graph component id"))?;
            ids.insert(component.package_name.to_string(), (name.to_string(), scope.to_string()));
            escaped.push(escape(component.package_name));
        }
        let pattern = if escaped.is_empty() {
            None
        } else {
            let source = format!(r#"({})@file:[^'"(]+"#, escaped.join("|"));
            Some(
                Regex::new(&source)
                    .map_err(|error| decline(format!("dependency graph pattern: {error}")))?,
            )
        };
        Ok(Self { pattern, replacements, components: ids })
    }

    /// `replaceFileVersion(s)`.
    pub fn replace(&self, text: &str) -> String {
        let Some(pattern) = self.pattern
            .as_ref()
            .filter(|_| text.contains("@file:"))
        else {
            return text.to_string();
        };
        let mut output = String::new();
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
    pub fn component(&self, package_name: &str) -> Option<&(String, String)> {
        self.components.get(package_name)
    }

    pub fn package_names(&self) -> impl Iterator<Item = &str> {
        self.replacements.keys().map(String::as_str)
    }
}

/// `snapToSemver`: a hash (`isHash`: 3 to 40 hexadecimal digits) as a
/// prerelease of `0.0.0`.
fn snap_to_semver(version: &str) -> String {
    let hash =
        (3..=40).contains(&version.len()) && version.bytes().all(|byte| byte.is_ascii_hexdigit());
    if hash { format!("{SNAP_PREFIX}{version}") } else { version.to_string() }
}

/// `name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`.
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
