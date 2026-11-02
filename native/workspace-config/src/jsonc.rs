//! `JSONC` [`parse`] and comment-preserving [`Document`] edits across [`Node`] and [`Object`].
//!
//! Bit reads and writes `workspace.jsonc` with comment-json 4.2.5: the whole
//! file is re-serialized with `stringify(data, undefined, 2)`, comments are
//! attached to the property they surround (by name), and deleting then
//! re-adding a property keeps them. [`Document`] reproduces that model and
//! output byte for byte, including comment-json's quirks (`JavaScript` property
//! order, no newline between a leading block comment and `{`, partial string
//! escaping).

pub use node::{Comment, Comments, Node, Object};

mod lexer;
mod node;
mod parser;
mod stringify;
#[cfg(test)]
mod tests;

use indexmap::IndexMap;
use serde_json::Value;
use std::{fmt, io};

/// Parse `JSONC` (comments and trailing commas) via [`Document::parse`] into plain JSON, keeping the
/// key order `JavaScript` would.
#[inline]
pub fn parse(text: &str) -> io::Result<Value> {
    Ok(Document::parse(text)?.value())
}

/// A `JSONC` document that keeps its [`Comment`] entries across edits.
#[derive(Debug, Clone, PartialEq)]
pub struct Document {
    root: Node,
    before_all: Vec<Comment>,
    after_all: Vec<Comment>,
}

impl Document {
    /// Parses `text` into a comment-preserving `JSONC` [`Document`].
    /// Preserves leading `before_all` and trailing `after_all` comment blocks.
    #[inline]
    pub fn parse(text: &str) -> io::Result<Self> {
        let parsed = parser::parse(text)?;
        Ok(Self { root: parsed.root, before_all: parsed.before_all, after_all: parsed.after_all })
    }

    /// The whole document as plain JSON.
    #[must_use]
    #[inline]
    pub fn value(&self) -> Value {
        self.root.to_value()
    }

    /// The root node, with comments.
    #[must_use]
    #[inline]
    pub const fn root(&self) -> &Node {
        &self.root
    }

    /// The value at `path` (object keys), as plain JSON.
    #[must_use]
    #[inline]
    pub fn get(&self, path: &[&str]) -> Option<Value> {
        let mut node = &self.root;
        for key in path {
            node = match node {
                Node::Object(object) => object.entries
                    .get(*key)
                    .or_else(|| object.entries.get(key.trim()))?,
                Node::Array(items, _) => items.get(key.trim().parse::<usize>().ok()?)?,
                _ => return None,
            };
        }
        Some(node.to_value())
    }

    /// The object at `path`, created (replacing non-objects) along the way.
    /// Reuses an existing trimmed key when an exact key is absent.
    fn object_mut(&mut self, path: &[&str]) -> &mut Object {
        let mut node = &mut self.root;
        for key in path {
            if !matches!(node, Node::Object(_)) {
                *node = Node::Object(Object::default());
            }
            let Node::Object(object) = node else { unreachable!("replaced by an object above") };
            let resolved =
                if !object.entries.contains_key(*key) && object.entries.contains_key(key.trim()) {
                    key.trim()
                } else {
                    *key
                };
            node = object.entries
                .entry(resolved.to_owned())
                .or_insert_with(|| Node::Object(Object::default()));
        }
        if !matches!(node, Node::Object(_)) {
            *node = Node::Object(Object::default());
        }
        let Node::Object(object) = node else { unreachable!("replaced by an object above") };
        object
    }

    /// `obj[key] = value` at `path`: an existing key keeps its position and
    /// its comments, a new key is appended. Empty `path` replaces the root.
    #[inline]
    pub fn set(&mut self, path: &[&str], value: &Value) {
        let Some((key, parent)) = path.split_last() else {
            self.root = Node::from_value(value);
            return;
        };
        self.object_mut(parent).entries
            .insert((*key).to_owned(), Node::from_value(value));
    }

    /// `delete obj[key]` at `path`. The property's comments stay attached to
    /// its name, as in comment-json. Returns whether it existed.
    pub fn remove(&mut self, path: &[&str]) -> bool {
        let Some((key, parent)) = path.split_last() else { return false };
        let mut node = &mut self.root;
        for segment in parent {
            let Node::Object(object) = node else { return false };
            let index = object.entries
                .get_index_of(*segment)
                .or_else(|| object.entries.get_index_of(segment.trim()));
            let Some((_, child)) = index.and_then(|idx| object.entries.get_index_mut(idx)) else {
                return false;
            };
            node = child;
        }
        let Node::Object(object) = node else { return false };
        object.entries.shift_remove(*key).is_some()
            || object.entries.shift_remove(key.trim()).is_some()
    }

    /// comment-json `assign(target, source)` on the object at `path`: each
    /// source key is set in order, keeping existing positions and comments.
    #[inline]
    pub fn assign(&mut self, path: &[&str], source: &serde_json::Map<String, Value>) {
        let object = self.object_mut(path);
        object.entries.reserve(source.len());
        for (key, value) in source {
            object.entries.insert(key.clone(), Node::from_value(value));
        }
    }

    /// Delete every key of the object at `path`, then assign `entries` in their
    /// order: how `updateConfigPolicy` rewrites a policy field so its entries
    /// end up in the new order while each entry's comments survive.
    #[inline]
    pub fn replace_entries(&mut self, path: &[&str], entries: &IndexMap<String, Value>) {
        let object = self.object_mut(path);
        object.entries.clear();
        object.entries.reserve(entries.len());
        for (key, value) in entries {
            object.entries.insert(key.clone(), Node::from_value(value));
        }
    }
}

/// comment-json's `stringify(data, undefined, 2)`. Bit writes the file with a
/// trailing newline: `format!("{document}\n")`.
impl fmt::Display for Document {
    #[inline]
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&stringify::document(&self.root, &self.before_all, &self.after_all))
    }
}
