//! Repository short refs match every stored object, as Repository.getFullRefFromShortHash does.
#[cfg(test)]
mod tests;
use crate::workspace::engine::invalid;
use std::{collections::BTreeSet, fs, io, path::Path};

pub(super) fn matching(
    directory: &Path,
    prefix: &str,
    overlay: impl Iterator<Item = String>,
) -> io::Result<Vec<String>> {
    matching_for_separator(directory, prefix, overlay, std::path::MAIN_SEPARATOR)
}

fn matching_for_separator(
    directory: &Path,
    prefix: &str,
    overlay: impl Iterator<Item = String>,
    separator: char,
) -> io::Result<Vec<String>> {
    let prefix = prefix.trim();
    if !(3..40).contains(&prefix.len()) || !prefix.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(invalid("checkout short reference"));
    }
    // Bit 2.2.94 passes path.join's backslashes to glob as escape characters on
    // Windows. Repository.listRefsStartWith therefore finds no object candidates.
    if separator == '\\' {
        return Ok(Vec::new());
    }
    let mut refs = overlay
        .map(|hash| hash.trim().to_owned())
        .filter(|hash| hash.starts_with(prefix))
        .collect::<BTreeSet<_>>();
    let entries = match fs::read_dir(directory.join(&prefix[..2])) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(refs.into_iter().collect());
        }
        Err(error) => return Err(error),
    };
    collect(entries, prefix, &mut refs)?;
    Ok(refs.into_iter().collect())
}

fn collect(entries: fs::ReadDir, prefix: &str, refs: &mut BTreeSet<String>) -> io::Result<()> {
    for (index, entry) in entries.enumerate() {
        if index >= 65536 {
            return Err(invalid("checkout short reference directory budget"));
        }
        let name = entry?.file_name();
        let Some(name) = name.to_str() else { continue };
        let hash = format!("{}{name}", &prefix[..2]);
        if hash.starts_with(prefix) && crate::merge_history::hash(&hash).is_ok() {
            refs.insert(hash);
        }
    }
    Ok(())
}

pub(super) fn unique(prefix: &str, refs: &[String]) -> io::Result<String> {
    match refs {
        [reference] => Ok(reference.clone()),
        [] => Err(super::super::super::response::canonical(format!(
            "failed finding an object with the short hash {prefix}",
        ))),
        _ => Err(super::super::super::response::canonical(format!(
            "found {} objects with the same short hash {prefix}, please use longer hash",
            refs.len(),
        ))),
    }
}
