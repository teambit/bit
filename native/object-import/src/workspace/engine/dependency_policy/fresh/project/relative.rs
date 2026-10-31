//! Ownership and issue records for relative component and untracked file imports.

use super::{Detect, invalid, unversioned};
use serde_json::{Map, Value, json};
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Default)]
pub(super) struct State {
    owners: Option<Vec<Owner>>,
    pub(super) processed: HashSet<String>,
    pub(super) untracked: Map<String, Value>,
    pub(super) authored: Map<String, Value>,
}

#[derive(Clone)]
pub(super) struct Owner {
    pub(super) directory: PathBuf,
    pub(super) identity: String,
    pub(super) id: Value,
    issue_id: Value,
}

impl State {
    pub(super) fn owner(&mut self, request: &Detect, file: &str) -> io::Result<Option<Owner>> {
        if self.owners.is_none() {
            self.owners = Some(owners(request)?);
        }
        Ok(self.owners
            .as_deref()
            .unwrap_or_default()
            .iter()
            .filter(|owner| Path::new(file).starts_with(&owner.directory))
            .max_by_key(|owner| owner.directory.components().count())
            .cloned())
    }

    pub(super) fn untracked(&mut self, origin: &str, file: &str, nested: bool) -> io::Result<()> {
        let mut existing = false;
        for value in self.untracked.values_mut() {
            for found in value["untrackedFiles"]
                .as_array_mut()
                .ok_or_else(|| invalid("untracked issue files"))?
            {
                if found["relativePath"] == file {
                    found["existing"] = json!(true);
                    existing = true;
                }
            }
        }
        let entry = self.untracked
            .entry(origin.to_owned())
            .or_insert_with(|| json!({"nested":nested,"untrackedFiles":[]}));
        entry["untrackedFiles"]
            .as_array_mut()
            .ok_or_else(|| invalid("untracked issue file list"))?
            .push(json!({"relativePath":file,"existing":existing}));
        Ok(())
    }

    pub(super) fn authored(
        &mut self,
        origin: &str,
        owner: &Owner,
        source: &str,
        relative: &Value,
    ) -> io::Result<()> {
        self.authored
            .entry(origin.to_owned())
            .or_insert_with(|| json!([]))
            .as_array_mut()
            .ok_or_else(|| invalid("relative authored records"))?
            .push(
                json!({"importSource":source,"componentId":owner.issue_id,"relativePath":relative}),
            );
        Ok(())
    }
}

fn owners(request: &Detect) -> io::Result<Vec<Owner>> {
    let text = match fs::read_to_string(request.root.join(".bitmap")) {
        Ok(text) => text,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    let bitmap = crate::parse_jsonc(text.as_bytes())?;
    let rows = bitmap.as_object().ok_or_else(|| invalid("relative dependency bitmap"))?;
    rows.iter()
        .filter(|(key, _)| !key.starts_with('_') && !key.starts_with('$'))
        .map(|(key, row)| owner(request, key, row))
        .collect::<io::Result<Vec<_>>>()
        .map(|rows| rows.into_iter().flatten().collect())
}

fn owner(request: &Detect, key: &str, row: &Value) -> io::Result<Option<Owner>> {
    let Some(directory) = row["rootDir"]
        .as_str()
        .map(str::trim)
        .filter(|dir| !dir.is_empty())
    else {
        return Ok(None);
    };
    let Some(identity) = matching_identity(request, key, row)? else { return Ok(None) };
    let (base, version) = identity
        .rsplit_once('@')
        .map_or((identity, None), |(id, version)| (id.trim(), Some(version.trim())));
    let (scope, name) = base
        .split_once('/')
        .map(|(scope, name)| (scope.trim(), name.trim()))
        .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
        .ok_or_else(|| invalid("relative owner identity"))?;
    let version = version.filter(|ver| !ver.is_empty());
    let mut id = json!({"scope":scope,"name":name});
    if let Some(ver) = version {
        id["version"] = json!(ver);
    }
    let row_scope = row["scope"]
        .as_str()
        .map(str::trim)
        .unwrap_or_default();
    let issue_id = if row_scope.is_empty() {
        json!({"_legacy":{"scope":null,"name":name,"version":version.unwrap_or("latest")},"_scope":scope})
    } else {
        id.clone()
    };
    Ok(Some(Owner {
        directory: request.root.join(directory),
        identity: base.to_owned(),
        id,
        issue_id,
    }))
}

fn matching_identity<'a>(
    request: &'a Detect,
    key: &str,
    row: &Value,
) -> io::Result<Option<&'a str>> {
    let name = row["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| key.trim());
    if name.is_empty() {
        return Ok(None);
    }
    let suffix = format!("/{name}");
    let row_scope = row["scope"]
        .as_str()
        .map(str::trim)
        .unwrap_or_default();
    let mut ids = request.detection.workspace_components
        .iter()
        .filter(|id| {
            let trimmed = id.trim();
            unversioned(trimmed).ends_with(&suffix)
                && (row_scope.is_empty() || trimmed.starts_with(&format!("{row_scope}/")))
        });
    let Some(identity) = ids.next().map(|id| id.trim()) else { return Ok(None) };
    if ids.next().is_some() {
        return Err(invalid("ambiguous relative component ownership"));
    }
    Ok(Some(identity))
}

pub(super) fn path(base: &Path, file: &Path) -> io::Result<String> {
    let left = base.components().collect::<Vec<_>>();
    let right = file.components().collect::<Vec<_>>();
    let shared = left
        .iter()
        .zip(&right)
        .take_while(|(left, right)| left == right)
        .count();
    if shared == 0 {
        return Err(invalid("relative dependency across filesystem roots"));
    }
    let mut parts = vec!["..".to_string(); left.len() - shared];
    for part in &right[shared..] {
        parts.push(
            part.as_os_str()
                .to_str()
                .ok_or_else(|| invalid("relative file encoding"))?
                .to_owned(),
        );
    }
    Ok(parts.join("/"))
}

pub(super) fn dependency(graph: &Value, origin: &str, edge: &str) -> io::Result<Value> {
    let rows = graph["pathMap"].as_array().ok_or_else(|| invalid("relative path map"))?;
    let row = rows
        .iter()
        .find(|row| row["file"] == origin)
        .ok_or_else(|| invalid("relative origin path map"))?;
    let rows = row["dependencies"].as_array().ok_or_else(|| invalid("relative origin imports"))?;
    rows.iter()
        .find(|row| row["resolvedDep"] == edge)
        .cloned()
        .ok_or_else(|| invalid("relative import record"))
}

pub(super) fn paths(
    root: &Path,
    edge: &str,
    owner: &Owner,
    dependency: &Value,
) -> io::Result<Value> {
    let mut value = json!({"sourceRelativePath":path(root,Path::new(edge))?,"destinationRelativePath":path(&owner.directory,Path::new(edge))?});
    if let Some(specifiers) = dependency.get("importSpecifiers").and_then(Value::as_array) {
        value["importSpecifiers"] = json!(
            specifiers
                .iter()
                .map(|specifier| {
                    let mut specifier = if specifier.get("mainFile").is_some() {
                        specifier.clone()
                    } else {
                        json!({"mainFile":specifier})
                    };
                    if let Some(main) = specifier["mainFile"].as_object_mut() {
                        main.remove("exported");
                    }
                    specifier
                })
                .collect::<Vec<_>>()
        );
    }
    Ok(value)
}

impl super::Projection<'_> {
    pub(super) fn external_relative(
        &mut self,
        origin: &str,
        edge: &str,
        field: usize,
    ) -> io::Result<()> {
        let mut pending = vec![(origin.to_owned(), edge.to_owned(), field, false)];
        while let Some((origin, edge, field, nested)) = pending.pop() {
            let owner = self.metadata.relative.owner(self.request, &edge)?;
            if let Some(owner) = owner {
                if owner.identity != unversioned(&self.request.identity) {
                    self.cross_relative(&origin, &edge, field, &owner)?;
                }
                continue;
            }
            let origin_name = path(&self.request.component_root, Path::new(&origin))?;
            let file = path(&self.request.root, Path::new(&edge))?;
            self.metadata.relative.untracked(&origin_name, &file, nested)?;
            self.untracked_children(&edge, &mut pending)?;
            if self.metadata.relative.processed.len() > 65536 {
                return Err(invalid("untracked traversal budget"));
            }
        }
        Ok(())
    }

    fn untracked_children(
        &mut self,
        edge: &str,
        pending: &mut Vec<(String, String, usize, bool)>,
    ) -> io::Result<()> {
        if !self.metadata.relative.processed.insert(edge.to_owned()) {
            return Ok(());
        }
        let edges = self.graph["tree"][edge]
            .as_array()
            .ok_or_else(|| invalid("untracked dependency tree"))?;
        for child in edges.iter().rev() {
            let child = child
                .as_str()
                .map(str::trim)
                .filter(|child| !child.is_empty())
                .ok_or_else(|| invalid("untracked dependency path"))?;
            if !child.replace(std::path::MAIN_SEPARATOR, "/").contains("node_modules/") {
                pending.push((edge.to_owned(), child.to_owned(), 0, true));
            }
        }
        Ok(())
    }

    fn cross_relative(
        &mut self,
        origin: &str,
        edge: &str,
        field: usize,
        owner: &Owner,
    ) -> io::Result<()> {
        let dependency = dependency(self.graph, origin, edge)?;
        let source = dependency["importSource"]
            .as_str()
            .ok_or_else(|| invalid("relative component import"))?;
        let paths = paths(&self.request.root, edge, owner, &dependency)?;
        let file = path(&self.request.component_root, Path::new(origin))?;
        self.metadata.relative.authored(&file, owner, source, &paths)?;
        let existing = self.dependencies[0]
            .iter()
            .position(|row| super::identity(&row["id"]).is_ok_and(|id| id == owner.identity))
            .map(|index| (0, index))
            .or_else(|| {
                self.dependencies[1]
                    .iter()
                    .position(|row| {
                        super::identity(&row["id"]).is_ok_and(|id| id == owner.identity)
                    })
                    .map(|index| (1, index))
            });
        if let Some((lifecycle, index)) = existing {
            merge_paths(&mut self.dependencies[lifecycle][index], paths)?;
        } else {
            self.dependencies[field].push(json!({"id":owner.id,"relativePaths":[paths]}));
        }
        Ok(())
    }
}

fn merge_paths(dependency: &mut Value, path: Value) -> io::Result<()> {
    let rows = dependency["relativePaths"]
        .as_array_mut()
        .ok_or_else(|| invalid("relative dependency paths"))?;
    if let Some(existing) = rows
        .iter_mut()
        .find(|row| {
            row["sourceRelativePath"] == path["sourceRelativePath"]
                && row["destinationRelativePath"] == path["destinationRelativePath"]
        })
    {
        merge_specifiers(existing, &path)?;
    } else {
        rows.push(path);
    }
    Ok(())
}

fn merge_specifiers(existing: &mut Value, path: &Value) -> io::Result<()> {
    let Some(incoming) = path["importSpecifiers"].as_array() else { return Ok(()) };
    let current = existing
        .as_object_mut()
        .ok_or_else(|| invalid("relative path object"))?
        .entry("importSpecifiers")
        .or_insert_with(|| json!([]))
        .as_array_mut()
        .ok_or_else(|| invalid("relative import specifiers"))?;
    for specifier in incoming {
        if !current.contains(specifier) {
            current.push(specifier.clone());
        }
    }
    Ok(())
}
