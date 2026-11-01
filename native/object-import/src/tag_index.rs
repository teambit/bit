//! Index snapshot hashes by their newest normal or orphaned tag.
#[cfg(test)]
mod tests;

use std::collections::HashMap;

#[derive(Default)]
pub(crate) struct TagIndex(HashMap<String, (String, bool)>);
impl TagIndex {
    pub(crate) fn model(model: &serde_json::Value) -> Self {
        let mut index = Self::default();
        for field in ["orphanedVersions", "versions"] {
            let Some(tags) = model[field].as_object() else {
                continue;
            };
            for (label, hash) in tags {
                if let Some(hash) = hash.as_str() {
                    index.insert(hash, label, field == "versions");
                }
            }
        }
        index
    }
    pub(crate) fn insert(&mut self, hash: &str, label: &str, normal: bool) {
        let (hash, label) = (hash.trim(), label.trim());
        if !hash.is_empty() && !label.is_empty() {
            match self.0.entry(hash.to_ascii_lowercase()) {
                std::collections::hash_map::Entry::Occupied(mut entry) => {
                    if normal || !entry.get().1 {
                        entry.insert((label.to_owned(), normal));
                    }
                }
                std::collections::hash_map::Entry::Vacant(entry) => {
                    entry.insert((label.to_owned(), normal));
                }
            }
        }
    }
    pub(crate) fn get(&self, hash: &str) -> Option<(&str, bool)> {
        let hash = hash.trim();
        self.0
            .get(hash)
            .or_else(|| {
                hash.bytes()
                    .any(|byte| byte.is_ascii_uppercase())
                    .then(|| self.0.get(&hash.to_ascii_lowercase()))
                    .flatten()
            })
            .map(|(label, normal)| (label.as_str(), *normal))
    }
}
