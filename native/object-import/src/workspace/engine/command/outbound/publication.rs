//! Publish one original-scope export batch locally after remote `ExportPersist`.
use super::{Prepare, invalid, model::Selected};
use crate::store::Store;
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

struct Component {
    model_hash: String,
    model_before: Vec<u8>,
    model_after: Vec<u8>,
    history_hash: String,
    history: Vec<u8>,
}
struct Preimage {
    index: Vec<u8>,
    refs: Option<Vec<u8>>,
    staged: Option<Vec<u8>>,
    staged_config: Vec<u8>,
}
struct Output {
    refs: Vec<u8>,
    staged_config: Vec<u8>,
}

pub(super) struct Prepared {
    root: PathBuf,
    scope: String,
    components: Vec<Component>,
    preimage: Preimage,
    output: Output,
    bitmap: super::super::bitmap::Prepared,
    file_id: String,
    expected_ids: HashSet<String>,
}

pub(super) fn prepare(input: &Prepare, selected: &[Selected], host: &str) -> io::Result<Prepared> {
    super::super::bitmap::validate_history_file_id(&input.transport.bitmap_history_file_id)?;
    if host.is_empty() {
        return Err(invalid("outbound remote host"));
    }
    let first = validate_selected(selected)?;
    let bitmap = prepare_bitmap(input, selected)?;
    let preimage = prepare_preimage(&input.root, &first.scope)?;
    let output = Output {
        refs: prepare_refs(preimage.refs.as_deref(), &first.scope, selected)?,
        staged_config: prepare_staged_config(&preimage.staged_config, selected)?,
    };
    let expected_ids = expected_ids(selected)?;
    let components = selected
        .iter()
        .map(|item| Component {
            model_hash: item.model.hash.clone(),
            model_before: item.model.before.clone(),
            model_after: item.model.after.clone(),
            history_hash: item.history.hash.clone(),
            history: item.history.bytes.clone(),
        })
        .collect();
    Ok(Prepared {
        root: input.root.clone(),
        scope: first.scope.clone(),
        components,
        preimage,
        output,
        bitmap,
        file_id: input.transport.bitmap_history_file_id.clone(),
        expected_ids,
    })
}

fn validate_selected(selected: &[Selected]) -> io::Result<&Selected> {
    let first = selected.first().ok_or_else(|| invalid("outbound empty publication"))?;
    if selected.len() > 4096
        || selected
            .iter()
            .any(|item| item.scope != first.scope)
    {
        return Err(invalid("outbound multiple remote scopes"));
    }
    Ok(first)
}

fn expected_ids(selected: &[Selected]) -> io::Result<HashSet<String>> {
    let ids = selected
        .iter()
        .map(|item| format!("{}/{}@{}", item.scope, item.name, item.version))
        .collect::<HashSet<_>>();
    if ids.len() != selected.len() {
        return Err(invalid("outbound duplicate component"));
    }
    Ok(ids)
}

fn prepare_bitmap(
    input: &Prepare,
    selected: &[Selected],
) -> io::Result<super::super::bitmap::Prepared> {
    let original = fs::read(input.root.join(".bitmap"))?;
    let identities = selected
        .iter()
        .map(|item| (item.scope.clone(), item.name.clone()))
        .collect::<Vec<_>>();
    super::super::bitmap::prepare_export_scopes(&input.root, original, &identities)
}

fn prepare_preimage(root: &Path, scope: &str) -> io::Result<Preimage> {
    let staged = read_optional(&root.join(".bit/staged-snaps"))?;
    if staged
        .as_ref()
        .is_some_and(|bytes| bytes.len() > 4 * 1024 * 1024)
    {
        return Err(invalid("outbound staged snap bounds"));
    }
    Ok(Preimage {
        index: fs::read(root.join(".bit/index.json"))?,
        refs: read_optional(&refs_path(root, scope))?,
        staged,
        staged_config: fs::read(root.join(".bit/staged-config/main.json"))?,
    })
}

impl Prepared {
    pub(super) fn stage_history(&self) -> io::Result<()> {
        let store = Store::new(self.root.join(".bit/objects"), None)?;
        for item in &self.components {
            store.write(&item.history_hash, &item.history)?;
        }
        Ok(())
    }

    pub(super) fn commit(self, exported_ids: &[String]) -> io::Result<()> {
        self.validate_acknowledgement(exported_ids)?;
        self.validate_preimage()?;
        self.publish()
    }

    fn validate_acknowledgement(&self, exported_ids: &[String]) -> io::Result<()> {
        if exported_ids.len() != self.expected_ids.len()
            || exported_ids
                .iter()
                .collect::<HashSet<_>>()
                .len()
                != exported_ids.len()
            || exported_ids
                .iter()
                .any(|id| !self.expected_ids.contains(id))
        {
            return Err(invalid("outbound remote acknowledgement"));
        }
        Ok(())
    }

    fn validate_preimage(&self) -> io::Result<()> {
        if fs::read(self.root.join(".bit/index.json"))? != self.preimage.index {
            return Err(invalid("outbound local index changed"));
        }
        for item in &self.components {
            let object = self.root
                .join(".bit/objects")
                .join(&item.model_hash[..2])
                .join(&item.model_hash[2..]);
            if fs::read(object)? != item.model_before {
                return Err(invalid("outbound local model changed"));
            }
        }
        self.bitmap.validate()?;
        if read_optional(&self.root.join(".bit/staged-snaps"))? != self.preimage.staged
            || fs::read(self.root.join(".bit/staged-config/main.json"))?
                != self.preimage.staged_config
            || read_optional(&refs_path(&self.root, &self.scope))?
                != self.preimage.refs
        {
            return Err(invalid("outbound staged or remote state changed"));
        }
        Ok(())
    }

    fn publish(self) -> io::Result<()> {
        let store = Store::new(self.root.join(".bit/objects"), None)?;
        for item in &self.components {
            store.write(&item.model_hash, &item.model_after)?;
            store.write(&item.history_hash, &item.history)?;
        }
        write_refs(&refs_path(&self.root, &self.scope), &self.output.refs)?;
        fs::write(self.root.join(".bit/staged-config/main.json"), self.output.staged_config)?;
        if self.preimage.staged.is_some() {
            fs::remove_file(self.root.join(".bit/staged-snaps"))?;
        }
        let _ = self.bitmap.commit(&self.file_id, "export")?;
        Ok(())
    }
}

fn prepare_staged_config(bytes: &[u8], selected: &[Selected]) -> io::Result<Vec<u8>> {
    let mut rows: Vec<Value> = serde_json::from_slice(bytes)?;
    if rows.len() > 4096 {
        return Err(invalid("outbound staged configuration bounds"));
    }
    let mut found = HashSet::new();
    rows.retain(|row| {
        let matched = selected
            .iter()
            .find(|item| row["id"]["scope"] == item.scope && row["id"]["name"] == item.name);
        if let Some(item) = matched {
            found.insert(format!("{}/{}", item.scope, item.name));
            false
        } else {
            true
        }
    });
    if found.len() != selected.len() {
        return Err(invalid("outbound staged configuration lifecycle"));
    }
    serde_json::to_vec_pretty(&rows).map_err(io::Error::other)
}

fn prepare_refs(before: Option<&[u8]>, scope: &str, selected: &[Selected]) -> io::Result<Vec<u8>> {
    let mut rows: Vec<Value> = match before {
        Some(bytes) => serde_json::from_slice(bytes)?,
        None => Vec::new(),
    };
    if rows.len() > 4096 {
        return Err(invalid("outbound remote refs bounds"));
    }
    for item in selected {
        let matches = rows
            .iter()
            .enumerate()
            .filter(|(_, row)| row["id"]["scope"] == scope && row["id"]["name"] == item.name)
            .map(|(index, _)| index)
            .collect::<Vec<_>>();
        if matches.len() > 1 {
            return Err(invalid("outbound duplicate remote ref"));
        }
        let value = json!({"id":{"scope":scope,"name":item.name},"head":item.head});
        if let Some(index) = matches.first() {
            rows[*index] = value;
        } else {
            rows.push(value);
        }
    }
    serde_json::to_vec_pretty(&rows).map_err(io::Error::other)
}

fn read_optional(path: &Path) -> io::Result<Option<Vec<u8>>> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}
fn refs_path(root: &Path, scope: &str) -> PathBuf {
    root.join(".bit/refs/remotes")
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
