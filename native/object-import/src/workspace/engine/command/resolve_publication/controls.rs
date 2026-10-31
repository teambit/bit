//! Pending merge and configuration cleanup after native Version publication.
use super::{HashSet, Path, PathBuf, Value, fs, io, proof};

pub(super) struct Prepared {
    pending: PathBuf,
    bytes: Option<Vec<u8>>,
    conflict: Option<(PathBuf, Option<String>)>,
    staged: bool,
}
impl Prepared {
    pub(super) fn stage(&mut self) -> io::Result<Vec<proof::Proof>> {
        self.commit()?;
        let mut proofs = Vec::new();
        if self.bytes.is_some() {
            proof::read(&self.pending, &mut proofs)?;
        }
        if let Some((path, _)) = &self.conflict {
            proof::read(path, &mut proofs)?;
        }
        self.staged = true;
        Ok(proofs)
    }
    pub(super) fn commit(&self) -> io::Result<()> {
        if self.staged {
            return Ok(());
        }
        if let Some(bytes) = &self.bytes {
            fs::write(&self.pending, bytes)?;
        }
        if let Some((path, text)) = &self.conflict {
            match text {
                Some(text) => fs::write(path, text)?,
                None => fs::remove_file(path)?,
            }
        }
        Ok(())
    }
}
pub(super) fn prepare(
    root: &Path,
    pending: &[Value],
    identities: &HashSet<&str>,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<Prepared> {
    let path = crate::scope_path(root).join("unmerged.json");
    proof::read(&path, proofs)?;
    let bytes = path
        .try_exists()?
        .then(|| pending_bytes(pending, identities))
        .transpose()?;
    let conflict = prepare_conflict(root, pending, identities, proofs)?;
    Ok(Prepared { pending: path, bytes, conflict, staged: false })
}
fn prepare_conflict(
    root: &Path,
    pending: &[Value],
    identities: &HashSet<&str>,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<Option<(PathBuf, Option<String>)>> {
    if pending.is_empty() {
        return Ok(None);
    }
    let path = root.join("merge-conflict");
    let Some(bytes) = proof::read(&path, proofs)? else { return Ok(None) };
    let text = std::str::from_utf8(&bytes).map_err(io::Error::other)?;
    let remaining = pending_bytes(pending, identities)?;
    let sections = retained_sections(text, identities);
    let text = if remaining == b"[]" || sections.is_empty() {
        None
    } else {
        Some(format!(
            "# Resolve configuration conflicts per component and make sure the Component ID remain in place\n\n{}",
            sections.join("\n\n"),
        ))
    };
    Ok(Some((path, text)))
}
fn retained_sections(text: &str, identities: &HashSet<&str>) -> Vec<String> {
    let divider = "-".repeat(80);
    let clean = text
        .lines()
        .filter(|line| *line != divider && !line.starts_with('#'))
        .collect::<Vec<_>>()
        .join("\n");
    clean
        .split("[*]")
        .filter_map(|part| {
            let (id, content) = part
                .split_once('\n')
                .unwrap_or((part, ""));
            let id = id.trim();
            let base = id.rsplit_once('@').map_or(id, |(prefix, _)| prefix.trim());
            (!id.is_empty()
                && !matches_selected(id, identities)
                && !matches_selected(base, identities))
            .then(|| format!("{divider}\n[*] {id}\n{divider}\n{content}"))
        })
        .collect()
}
fn pending_bytes(pending: &[Value], identities: &HashSet<&str>) -> io::Result<Vec<u8>> {
    let remaining = pending
        .iter()
        .filter(|row| {
            let id = &row["id"];
            let identity = if let Some(raw) = id.as_str() {
                let trimmed = raw.trim();
                trimmed
                    .rsplit_once('@')
                    .map_or(trimmed, |(base, _)| base.trim())
                    .to_owned()
            } else {
                let scope = id["scope"].as_str().map_or("", str::trim);
                let raw_name = id["name"].as_str().map_or("", str::trim);
                let name = raw_name.rsplit_once('@').map_or(raw_name, |(base, _)| base.trim());
                if scope.is_empty() { name.to_owned() } else { format!("{scope}/{name}") }
            };
            !matches_selected(&identity, identities)
        })
        .collect::<Vec<_>>();
    serde_json::to_vec_pretty(&remaining).map_err(io::Error::other)
}

fn matches_selected(identity: &str, identities: &HashSet<&str>) -> bool {
    let identity = identity.trim();
    if identity.is_empty() {
        return false;
    }
    if identities.contains(identity) {
        return true;
    }
    !identity.contains('/')
        && identities
            .iter()
            .any(|cand| {
                cand.trim()
                    .split_once('/')
                    .is_some_and(|(_, name)| name.trim() == identity)
            })
}
