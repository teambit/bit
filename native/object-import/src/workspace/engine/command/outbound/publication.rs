//! Publish all original-scope export batches locally after remote `ExportPersist`.
pub(super) use self::reconcile::present as reconcile_present;
mod reconcile;
mod removed;
use self::reconcile::prepare_staged_config;
use super::{Prepare, invalid, model::Selected};
use crate::store::Store;
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

struct Component {
    unchanged: bool,
    model_hash: String,
    model_before: Vec<u8>,
    model_after: Vec<u8>,
    history_hash: String,
    history: Vec<u8>,
}
struct Preimage {
    index: Vec<u8>,
    refs: BTreeMap<String, Option<Vec<u8>>>,
    staged: Option<Vec<u8>>,
    staged_config: Option<Vec<u8>>,
}
struct Output {
    refs: BTreeMap<String, Vec<u8>>,
    staged_config: Option<Vec<u8>>,
    staged: bool,
    updated_ids: Vec<String>,
    non_existing_ids: Vec<String>,
    removed_ids: Vec<String>,
}

pub(super) struct Prepared {
    root: PathBuf,
    components: Vec<Component>,
    preimage: Preimage,
    output: Output,
    bitmap: super::super::bitmap::Prepared,
    file_id: String,
    expected_ids: HashSet<String>,
    known_ids: HashSet<String>,
}

pub(super) fn prepare(
    input: &Prepare,
    selected: &[Selected],
    hosts: &HashMap<String, String>,
) -> io::Result<Prepared> {
    super::super::bitmap::validate_history_file_id(&input.transport.bitmap_history_file_id)?;
    let scopes = validate_selected(selected, hosts)?;
    let bitmap = prepare_bitmap(input, selected)?;
    let preimage = prepare_preimage(&input.root, &scopes)?;
    let refs = scopes
        .iter()
        .map(|scope| {
            let before = preimage.refs.get(scope).ok_or_else(|| invalid("outbound remote refs"))?;
            Ok((scope.clone(), prepare_refs(before.as_deref(), scope, selected)?))
        })
        .collect::<io::Result<BTreeMap<_, _>>>()?;
    let output = prepare_output(input, selected, &preimage, refs)?;
    let expected_ids = expected_ids(selected)?;
    let known_ids = collect_known_ids(&expected_ids, selected);
    let components = selected
        .iter()
        .map(Component::from_selected)
        .collect();
    Ok(Prepared {
        root: input.root.clone(),
        components,
        preimage,
        output,
        bitmap,
        file_id: input.transport.bitmap_history_file_id.clone(),
        expected_ids,
        known_ids,
    })
}

impl Component {
    fn from_selected(item: &Selected) -> Self {
        Self {
            unchanged: item.labels.is_empty(),
            model_hash: item.model.hash.clone(),
            model_before: item.model.before.clone(),
            model_after: item.model.after.clone(),
            history_hash: item.history.hash.clone(),
            history: item.history.bytes.clone(),
        }
    }
}

fn collect_known_ids(expected_ids: &HashSet<String>, selected: &[Selected]) -> HashSet<String> {
    let mut known_ids = expected_ids.clone();
    known_ids.extend(
        selected
            .iter()
            .flat_map(|item| {
                item.history.hashes
                    .iter()
                    .map(|hash| format!("{}/{}@{hash}", item.scope, item.name))
            }),
    );
    known_ids
}

fn prepare_output(
    input: &Prepare,
    selected: &[Selected],
    preimage: &Preimage,
    refs: BTreeMap<String, Vec<u8>>,
) -> io::Result<Output> {
    let removed_ids = match preimage.staged_config.as_deref() {
        Some(bytes) => removed::read(bytes)?,
        None => Vec::new(),
    };
    let staged_config = preimage.staged_config
        .as_deref()
        .map(|bytes| {
            prepare_staged_config(
                bytes,
                selected,
                !(input.options.all || input.options.all_versions),
            )
        })
        .transpose()?;
    Ok(Output {
        staged: false,
        updated_ids: Vec::new(),
        non_existing_ids: Vec::new(),
        removed_ids,
        refs,
        staged_config,
    })
}

fn validate_selected(
    selected: &[Selected],
    hosts: &HashMap<String, String>,
) -> io::Result<Vec<String>> {
    if selected.is_empty() || selected.len() > 4096 {
        return Err(invalid("outbound empty or oversized publication"));
    }
    let mut scopes = selected
        .iter()
        .map(|item| item.scope.clone())
        .collect::<Vec<_>>();
    scopes.sort_unstable();
    scopes.dedup();
    if scopes.len() != hosts.len()
        || scopes
            .iter()
            .any(|scope| hosts.get(scope).is_none_or(String::is_empty))
    {
        return Err(invalid("outbound remote hosts"));
    }
    Ok(scopes)
}

/// `ExportPersist` acknowledges every exported version, by its tag or hash.
fn expected_ids(selected: &[Selected]) -> io::Result<HashSet<String>> {
    let count = selected
        .iter()
        .map(|item| item.labels.len())
        .sum::<usize>();
    let ids = selected
        .iter()
        .flat_map(|item| {
            item.labels
                .iter()
                .map(|label| format!("{}/{}@{label}", item.scope, item.name))
        })
        .collect::<HashSet<_>>();
    if ids.len() != count {
        return Err(invalid("outbound duplicate component"));
    }
    Ok(ids)
}

fn prepare_bitmap(
    input: &Prepare,
    selected: &[Selected],
) -> io::Result<super::super::bitmap::Prepared> {
    let original = fs::read(input.root.join(".bitmap"))?;
    let bitmap = crate::recovery::jsonc::parse(&original)?;
    let identities = selected
        .iter()
        .filter(|item| {
            !item.labels.is_empty() && reconcile::present(&bitmap, &item.scope, &item.name)
        })
        .map(|item| (item.scope.clone(), item.name.clone()))
        .collect::<Vec<_>>();
    super::super::bitmap::prepare_export_scopes(&input.root, original, &identities)
}

fn prepare_preimage(root: &Path, scopes: &[String]) -> io::Result<Preimage> {
    let staged = read_optional(&crate::scope_path(root).join("staged-snaps"))?;
    if staged
        .as_ref()
        .is_some_and(|bytes| bytes.len() > 4 * 1024 * 1024)
    {
        return Err(invalid("outbound staged snap bounds"));
    }
    let refs = scopes
        .iter()
        .map(|scope| Ok((scope.clone(), read_optional(&refs_path(root, scope))?)))
        .collect::<io::Result<BTreeMap<_, _>>>()?;
    Ok(Preimage {
        index: fs::read(crate::scope_path(root).join("index.json"))?,
        refs,
        staged,
        staged_config: read_optional(&crate::scope_path(root).join("staged-config/main.json"))?,
    })
}

impl Prepared {
    pub(super) fn removed_ids(&self) -> &[String] {
        &self.output.removed_ids
    }

    pub(super) fn non_existing_ids(&self) -> &[String] {
        &self.output.non_existing_ids
    }

    pub(super) fn stage_history(&self) -> io::Result<()> {
        let store = Store::new(crate::scope_path(&self.root).join("objects"), None)?;
        for item in self.components.iter().filter(|item| !item.unchanged) {
            store.write(&item.history_hash, &item.history)?;
        }
        Ok(())
    }

    pub(super) fn commit(mut self, exported_ids: &[String]) -> io::Result<()> {
        self.stage(exported_ids)?;
        self.finish()
    }

    pub(super) fn stage(&mut self, exported_ids: &[String]) -> io::Result<Vec<String>> {
        if self.output.staged {
            return Ok(self.output.updated_ids.clone());
        }
        self.validate_acknowledgement(exported_ids)?;
        self.reconcile(exported_ids)?;
        self.validate_preimage()?;
        let store = Store::new(crate::scope_path(&self.root).join("objects"), None)?;
        self.write_objects(&store)?;
        for item in self.components.iter_mut().filter(|item| !item.unchanged) {
            item.model_before.clone_from(&item.model_after);
        }
        for (scope, refs) in &self.output.refs {
            write_refs(&refs_path(&self.root, scope), refs)?;
            self.preimage.refs.insert(scope.clone(), Some(refs.clone()));
        }
        self.output.staged = true;
        Ok(self.output.updated_ids.clone())
    }

    pub(super) fn finish(self) -> io::Result<()> {
        if !self.output.staged {
            return Err(invalid("outbound scope publication not staged"));
        }
        self.validate_preimage()?;
        self.publish_controls()
    }

    fn validate_acknowledgement(&self, exported_ids: &[String]) -> io::Result<()> {
        let ids = exported_ids.iter().collect::<HashSet<_>>();
        if ids.len() != exported_ids.len()
            || exported_ids
                .iter()
                .any(|id| !self.known_ids.contains(id))
        {
            return Err(invalid("outbound remote acknowledgement"));
        }
        Ok(())
    }

    fn validate_preimage(&self) -> io::Result<()> {
        if fs::read(crate::scope_path(&self.root).join("index.json"))?
            != self.preimage.index
        {
            return Err(invalid("outbound local index changed"));
        }
        for item in &self.components {
            let object = crate::scope_path(&self.root)
                .join("objects")
                .join(&item.model_hash[..2])
                .join(&item.model_hash[2..]);
            if fs::read(object)? != item.model_before {
                return Err(invalid("outbound local model changed"));
            }
        }
        self.bitmap.validate()?;
        if read_optional(&crate::scope_path(&self.root).join("staged-snaps"))?
            != self.preimage.staged
            || read_optional(&crate::scope_path(&self.root).join("staged-config/main.json"))?
                != self.preimage.staged_config
        {
            return Err(invalid("outbound staged or remote state changed"));
        }
        for (scope, before) in &self.preimage.refs {
            if read_optional(&refs_path(&self.root, scope))? != *before {
                return Err(invalid("outbound remote state changed"));
            }
        }
        Ok(())
    }

    fn publish_controls(self) -> io::Result<()> {
        if let Some(staged_config) = self.output.staged_config {
            let config_path = crate::scope_path(&self.root).join("staged-config/main.json");
            if let Some(parent) = config_path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(config_path, staged_config)?;
        }
        if self.preimage.staged.is_some() {
            fs::remove_file(crate::scope_path(&self.root).join("staged-snaps"))?;
        }
        let last_merged = crate::scope_path(&self.root).join("last-merged");
        crate::workspace::actions::remove(&last_merged)?;
        let _ = self.bitmap.commit(&self.file_id, "export")?;
        Ok(())
    }
}

fn prepare_refs(before: Option<&[u8]>, scope: &str, selected: &[Selected]) -> io::Result<Vec<u8>> {
    let mut rows: Vec<Value> = match before {
        Some(bytes) => crate::parse_jsonc(bytes)
            .and_then(|val| serde_json::from_value(val).map_err(io::Error::other))?,
        None => Vec::new(),
    };
    if rows.len() > 4096 {
        return Err(invalid("outbound remote refs bounds"));
    }
    for item in selected
        .iter()
        .filter(|item| item.scope == scope)
    {
        set_ref(&mut rows, scope, item)?;
    }
    serde_json::to_vec_pretty(&rows).map_err(io::Error::other)
}

/// The remote ref of `item`, replaced or added.
fn set_ref(rows: &mut Vec<Value>, scope: &str, item: &Selected) -> io::Result<()> {
    let matches: Vec<usize> = rows
        .iter()
        .enumerate()
        .filter(|(_, row)| {
            crate::workspace::engine::command::inbound::remote::file_list::row_lane_matches(
                row, scope, &item.name,
            )
        })
        .map(|(index, _)| index)
        .collect();
    let value = json!({"id":{"scope":scope,"name":item.name},"head":item.head});
    match matches.as_slice() {
        [] => rows.push(value),
        [index] => rows[*index] = value,
        _ => return Err(invalid("outbound duplicate remote ref")),
    }
    Ok(())
}

fn read_optional(path: &Path) -> io::Result<Option<Vec<u8>>> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}
fn refs_path(root: &Path, scope: &str) -> PathBuf {
    crate::scope_path(root)
        .join("refs/remotes")
        .join(scope)
        .join("main")
}
fn write_refs(path: &Path, bytes: &[u8]) -> io::Result<()> {
    fs::create_dir_all(path.parent().ok_or_else(|| invalid("outbound refs parent"))?)?;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(path)?;
    file.write_all(bytes)?;
    file.sync_all()
}

#[cfg(test)]
mod tests;
