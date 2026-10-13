use super::{Reader, Request, invalid, remotes, versions};
use rayon::prelude::*;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{collections::HashMap, fs::File, io, path::Path};

pub(super) fn read(
    reader: &Reader<'_>,
    models: &[Value],
    request: &Request,
    pool: &rayon::ThreadPool,
) -> io::Result<Vec<Value>> {
    ordinary_merge_state(&request.root)?;
    let remotes = remotes::read(&request.root, models)?;
    let targets: HashMap<_, _> = request.targets
        .iter()
        .map(|target| (target.identity.as_str(), target.version.as_str()))
        .collect();
    pool.install(|| {
        models
            .par_iter()
            .map(|model| compare(reader, model, &targets, &remotes))
            .collect()
    })
}
fn compare(
    reader: &Reader<'_>,
    model: &Value,
    targets: &HashMap<&str, &str>,
    remotes: &HashMap<String, String>,
) -> io::Result<Value> {
    let identity = format!(
        "{}/{}",
        model["scope"].as_str().ok_or_else(|| invalid("status model scope"))?,
        model["name"].as_str().ok_or_else(|| invalid("status model name"))?,
    );
    let remote = remotes.get(&identity).map(String::as_str);
    let head = model
        .get("head")
        .filter(|value| !value.is_null())
        .map(|value| value.as_str().ok_or_else(|| invalid("status model head")))
        .transpose()?;
    let workspace = targets
        .get(identity.as_str())
        .filter(|version| !version.is_empty())
        .map(|version| versions::reference(model, version))
        .transpose()?;
    // The canonical no-remote branch traverses the model head, even when
    // a detached workspace version was passed as the source head.
    let source = if remote.is_some() { workspace.as_deref().or(head) } else { head };
    distances(reader, model, &identity, source, head, remote)
}

fn distances(
    reader: &Reader<'_>,
    model: &Value,
    identity: &str,
    source: Option<&str>,
    head: Option<&str>,
    remote: Option<&str>,
) -> io::Result<Value> {
    let records = if source == remote && head == remote {
        json!([])
    } else {
        let hash = crate::validate::hexadecimal(&Sha1::digest(
            format!("{identity}:VersionHistory").as_bytes(),
        ));
        let history = reader.read(&hash, "VersionHistory")?;
        if history["name"] != model["name"] || history["scope"] != model["scope"] {
            return Err(invalid("status history identity"));
        }
        history["versions"].clone()
    };
    let distance = |from| {
        if from == remote {
            Ok(json!({"sourceOnly":[],"targetOnly":[],"noCommon":false}))
        } else {
            crate::merge_history::status::distance(&records, from, remote)
        }
    };
    Ok(
        json!({"identity":identity,"remoteHead":remote,"status":distance(source)?,"merge":distance(head)?}),
    )
}

fn ordinary_merge_state(root: &Path) -> io::Result<()> {
    let file = match File::open(root.join(".bit/unmerged.json")) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    let bytes = crate::read_budget::Budget::new(1024 * 1024).read(file)?;
    let value: Value = serde_json::from_slice(&bytes).map_err(io::Error::other)?;
    if !value.as_array().is_some_and(Vec::is_empty) {
        return Err(invalid("status unresolved merge state requires canonical history"));
    }
    Ok(())
}
