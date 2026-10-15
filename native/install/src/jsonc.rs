//! JSONC parsing and comment-preserving edits.
//!
//! Bit reads and writes `workspace.jsonc` with comment-json 4.2.5: the whole
//! file is re-serialized with `stringify(data, undefined, 2)`, comments are
//! attached to the property they surround (by name), and deleting then
//! re-adding a property keeps them. [`Document`] reproduces that model and
//! output byte for byte, including comment-json's quirks (JavaScript property
//! order, no newline between a leading block comment and `{`, partial string
//! escaping).

pub use node::{Comment, Comments, Node, Object};

mod lexer;
mod node;
mod parser;
mod stringify;

use indexmap::IndexMap;
use serde_json::Value;
use std::{fmt, io};

/// Parse JSONC (comments and trailing commas) into plain JSON, keeping the
/// key order JavaScript would.
pub fn parse(text: &str) -> io::Result<Value> {
    Ok(Document::parse(text)?.value())
}

/// A JSONC document that keeps its comments across edits.
#[derive(Debug, Clone, PartialEq)]
pub struct Document {
    root: Node,
    before_all: Vec<Comment>,
    after_all: Vec<Comment>,
}

impl Document {
    pub fn parse(text: &str) -> io::Result<Self> {
        let parsed = parser::parse(text)?;
        Ok(Self { root: parsed.root, before_all: parsed.before_all, after_all: parsed.after_all })
    }

    /// The whole document as plain JSON.
    #[must_use]
    pub fn value(&self) -> Value {
        self.root.to_value()
    }

    /// The root node, with comments.
    #[must_use]
    pub const fn root(&self) -> &Node {
        &self.root
    }

    /// The value at `path` (object keys), as plain JSON.
    #[must_use]
    pub fn get(&self, path: &[&str]) -> Option<Value> {
        let mut node = &self.root;
        for key in path {
            let Node::Object(object) = node else { return None };
            node = object.entries.get(*key)?;
        }
        Some(node.to_value())
    }

    /// The object at `path`, created (replacing non-objects) along the way.
    fn object_mut(&mut self, path: &[&str]) -> &mut Object {
        let mut node = &mut self.root;
        for key in path {
            if !matches!(node, Node::Object(_)) {
                *node = Node::Object(Object::default());
            }
            let Node::Object(object) = node else { unreachable!("replaced by an object above") };
            node = object.entries
                .entry((*key).to_owned())
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
            let Some(child) = object.entries.get_mut(*segment) else { return false };
            node = child;
        }
        let Node::Object(object) = node else { return false };
        object.entries.shift_remove(*key).is_some()
    }

    /// comment-json `assign(target, source)` on the object at `path`: each
    /// source key is set in order, keeping existing positions and comments.
    pub fn assign(&mut self, path: &[&str], source: &serde_json::Map<String, Value>) {
        let object = self.object_mut(path);
        for (key, value) in source {
            object.entries.insert(key.clone(), Node::from_value(value));
        }
    }

    /// Delete every key of the object at `path`, then assign `entries` in their
    /// order: how `updateConfigPolicy` rewrites a policy field so its entries
    /// end up in the new order while each entry's comments survive.
    pub fn replace_entries(&mut self, path: &[&str], entries: &IndexMap<String, Value>) {
        let object = self.object_mut(path);
        object.entries.clear();
        for (key, value) in entries {
            object.entries.insert(key.clone(), Node::from_value(value));
        }
    }
}

/// comment-json's `stringify(data, undefined, 2)`. Bit writes the file with a
/// trailing newline: `format!("{document}\n")`.
impl fmt::Display for Document {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&stringify::document(&self.root, &self.before_all, &self.after_all))
    }
}

#[cfg(test)]
mod tests;
