//! Index snapshot hashes by their newest normal or orphaned tag.
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
        self.0.insert(hash.to_owned(), (label.to_owned(), normal));
    }
    pub(crate) fn get(&self, hash: &str) -> Option<(&str, bool)> {
        self.0
            .get(hash)
            .map(|(label, normal)| (label.as_str(), *normal))
    }
}
#[cfg(test)]
mod tests;
