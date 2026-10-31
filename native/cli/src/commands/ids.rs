//! The parts of `ComponentID` (and the legacy `BitId` behind it) that
//! `diffMetadata` uses: parsing, equality with and without the version, and
//! the version as stored, where `latest` counts as no version.

use crate::commands::status::js::{decline, text};
use serde_json::Value;
use std::io;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Id {
    scope: String,
    name: String,
    /// `id.version`: `None` is `undefined`; `latest` is kept as it is.
    pub version: Option<String>,
}

impl Id {
    /// `ComponentID.fromString(text)` (`BitId.parse(text, true)`).
    pub fn parse(id: &str) -> io::Result<Self> {
        let id = id.trim();
        let (id, version) = match id.rfind('@') {
            Some(index) if index > 0 => {
                let mut parts = id.split('@');
                let name = parts.next().unwrap_or_default().trim();
                (
                    name,
                    parts
                        .next()
                        .unwrap_or_default()
                        .trim()
                        .to_string(),
                )
            }
            _ => (id, "latest".to_string()),
        };
        let (scope, name) = id.split_once('/').ok_or_else(|| decline("invalid component id"))?;
        let (scope, name) = (scope.trim(), name.trim());
        if name.is_empty() || scope.is_empty() {
            return Err(decline("component id without scope or name"));
        }
        let version = Some(version).filter(|version| !version.is_empty());
        Ok(Self { scope: scope.to_string(), name: name.to_string(), version })
    }

    /// `ComponentID.fromObject({ scope, name, version })`.
    pub fn from_object(id: &Value) -> io::Result<Self> {
        if let Some(raw) = id.as_str() {
            return Self::parse(raw);
        }
        let scope = text(id.get("scope"))?.trim();
        let name = text(id.get("name"))?.trim();
        if scope.is_empty() || name.is_empty() {
            return Err(decline("component id without scope or name"));
        }
        let version = match id.get("version") {
            None | Some(Value::Null) => None,
            Some(version) => {
                Some(text(Some(version))?.trim().to_string()).filter(|value| !value.is_empty())
            }
        };
        Ok(Self { scope: scope.to_string(), name: name.to_string(), version })
    }

    /// `id.changeVersion(version)`.
    pub fn with_version(&self, version: Option<String>) -> Self {
        let version = version
            .map(|val| val.trim().to_owned())
            .filter(|value| !value.is_empty());
        Self { version, ..self.clone() }
    }

    /// `id.scope`.
    pub fn scope(&self) -> &str {
        &self.scope
    }

    /// `hasVersion()`: a version other than `latest` or `head`.
    pub fn has_version(&self) -> bool {
        self.version
            .as_deref()
            .map(str::trim)
            .filter(|version| !version.is_empty())
            .is_some_and(|version| !matches!(version, "latest" | "head"))
    }

    pub fn without_version(&self) -> String {
        format!("{}/{}", self.scope, self.name)
    }

    /// `id.toString()`.
    pub fn display(&self) -> String {
        match self.version.as_deref().filter(|_| self.has_version()) {
            Some(version) => format!("{}@{version}", self.without_version()),
            None => self.without_version(),
        }
    }

    /// `searchWithoutVersion`'s test: same scope and name.
    pub fn same_without_version(&self, other: &Self) -> bool {
        self.scope == other.scope && self.name == other.name
    }

    /// `isEqual`: same scope and name, and the same version where both have one.
    pub fn same(&self, other: &Self) -> bool {
        let same_version = match (self.has_version(), other.has_version()) {
            (true, true) => self.version == other.version,
            (false, false) => true,
            _ => false,
        };
        self.same_without_version(other) && same_version
    }

    /// `ComponentIdList.uniqFromArray`: the first of each `toString()`.
    pub fn unique(ids: impl IntoIterator<Item = Self>) -> Vec<Self> {
        let mut seen = std::collections::HashSet::new();
        ids.into_iter()
            .filter(|id| seen.insert(id.display()))
            .collect()
    }
}
