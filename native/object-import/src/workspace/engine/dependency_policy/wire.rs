use super::{invalid, io};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

type Packages = Map<String, Value>;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Entry {
    pub(in crate::workspace::engine) identity: String,
    pub(in crate::workspace::engine) package_name: Option<String>,
    pub(in crate::workspace::engine) version_range: Option<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub(in crate::workspace::engine) version_from_config: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Missing {
    pub(super) is_dev_file: bool,
    pub(super) missing_packages: Vec<String>,
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Policy {
    pub(in crate::workspace::engine) dependencies: Packages,
    pub(in crate::workspace::engine) peer_dependencies: Packages,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Request {
    pub(super) packages: [Packages; 3],
    pub(super) components: [Vec<usize>; 3],
    pub(super) entries: Vec<Entry>,
    pub(super) ignored: [Vec<String>; 3],
    pub(super) missing: Vec<Missing>,
    pub(super) policies: Policies,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Policies {
    pub(super) model_peers: Packages,
    pub(super) package_policy: Policy,
    pub(super) workspace_policy: Policy,
    pub(super) automatic: [Packages; 3],
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Plan {
    pub(super) packages: [Packages; 3],
    pub(super) components: [Vec<usize>; 3],
    pub(super) ranges: Vec<Option<String>>,
    pub(super) missing: Vec<Vec<String>>,
    pub(super) removed: [Vec<String>; 3],
}
impl Plan {
    pub(super) fn new(request: &Request) -> Self {
        Self {
            packages: request.packages.clone(),
            components: request.components.clone(),
            ranges: request.entries
                .iter()
                .map(|entry| entry.version_range.clone())
                .collect(),
            missing: request.missing
                .iter()
                .map(|issue| issue.missing_packages.clone())
                .collect(),
            removed: std::array::from_fn(|_| Vec::new()),
        }
    }
}
impl Request {
    pub(super) fn ignore(&self, field: usize, name: &str, removed: &mut [Vec<String>; 3]) -> bool {
        let trimmed = name.trim();
        let ignored = self.ignored[field]
            .iter()
            .any(|entry| entry.trim() == trimmed);
        if ignored {
            removed[field].push(name.to_owned());
        }
        ignored
    }

    pub(super) fn validate(&self) -> io::Result<()> {
        let maps = self.packages
            .iter()
            .chain(&self.policies.automatic)
            .chain([
                &self.policies.model_peers,
                &self.policies.package_policy.dependencies,
                &self.policies.package_policy.peer_dependencies,
                &self.policies.workspace_policy.dependencies,
                &self.policies.workspace_policy.peer_dependencies,
            ]);
        let mut count = self.entries.len();
        for map in maps {
            count += map.len();
            if map
                .iter()
                .any(|(key, value)| !name(key) || !value.is_string())
            {
                return Err(invalid("dependency policy requires ordinary string maps"));
            }
        }
        count += self.ignored
            .iter()
            .map(Vec::len)
            .sum::<usize>();
        count += self.missing
            .iter()
            .map(|row| row.missing_packages.len())
            .sum::<usize>();
        count += self.components
            .iter()
            .map(Vec::len)
            .sum::<usize>();
        if count > 65536 || self.entries.len() > 4096 {
            return Err(invalid("dependency policy row limit"));
        }
        self.validate_components()
    }
    fn validate_components(&self) -> io::Result<()> {
        if self.components
            .iter()
            .flatten()
            .any(|index| *index >= self.entries.len())
        {
            return Err(invalid("dependency policy component index"));
        }
        if self.entries
            .iter()
            .any(|entry| {
                entry.identity.trim().is_empty()
                    || entry.package_name
                        .as_deref()
                        .is_some_and(|key| !name(key))
            })
        {
            return Err(invalid("dependency policy component identity"));
        }
        Ok(())
    }
}
pub(super) fn name(value: &str) -> bool {
    let value = value.trim();
    !value.is_empty()
        && !value.contains('\0')
        && !matches!(
            value,
            "__proto__"
                | "constructor"
                | "prototype"
                | "toString"
                | "valueOf"
                | "toLocaleString"
                | "hasOwnProperty"
                | "isPrototypeOf"
                | "propertyIsEnumerable"
                | "__defineGetter__"
                | "__defineSetter__"
                | "__lookupGetter__"
                | "__lookupSetter__",
        )
}
pub(in crate::workspace::engine) fn version(map: &Packages, name: &str) -> Option<String> {
    map.get(name)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}
