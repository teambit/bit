//! Unit tests for per-scope remote ref preparation ([`prepare_refs`]) and [`Selected`] host validation ([`validate_selected`]) in `bit-object-import`.
//!
//! Ensures remote ref updates with [`HistoryBytes`] and [`ModelBytes`] are grouped per scope via [`prepare_refs`] ([`selected`], [`prepares_remote_refs_independently_per_scope`]) and validated against [`Selected`] export targets via [`validate_selected`].

use super::{Selected, prepare_refs, validate_selected};
use crate::workspace::engine::command::outbound::model::{HistoryBytes, ModelBytes};
use serde_json::{Value, json};
use std::collections::HashMap;

/// Builds a synthetic [`Selected`] component export entry for `scope/name` with `head`.
fn selected(scope: &str, name: &str, head: &str) -> Selected {
    Selected {
        scope: scope.to_owned(),
        name: name.to_owned(),
        model: ModelBytes {
            hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_owned(),
            before: Vec::new(),
            after: Vec::new(),
        },
        history: HistoryBytes {
            hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".to_owned(),
            bytes: Vec::new(),
            hashes: Vec::new(),
        },
        head: head.to_owned(),
        labels: vec!["1.0.0".to_owned()],
        objects: Vec::new(),
    }
}

/// Verifies that [`prepare_refs`] serializes remote head ref updates independently for each target scope.
#[test]
fn prepares_remote_refs_independently_per_scope() {
    let selected = [selected("scope.one", "one", "111"), selected("scope.two", "two", "222")];
    let first: Vec<Value> =
        serde_json::from_slice(&prepare_refs(None, "scope.one", &selected).unwrap()).unwrap();
    let second: Vec<Value> =
        serde_json::from_slice(&prepare_refs(None, "scope.two", &selected).unwrap()).unwrap();
    assert_eq!(first, vec![json!({"id":{"scope":"scope.one","name":"one"},"head":"111"})]);
    assert_eq!(second, vec![json!({"id":{"scope":"scope.two","name":"two"},"head":"222"})]);
}

/// Verifies that [`validate_selected`] requires a configured remote host entry in [`HashMap`] for every [`selected`] export scope ([`prepares_remote_refs_independently_per_scope`]).
#[test]
fn validates_host_for_every_selected_scope() {
    let selected = [selected("scope.one", "one", "111"), selected("scope.two", "two", "222")];
    let mut hosts = HashMap::from([("scope.one".to_owned(), "file:///one".to_owned())]);
    assert!(validate_selected(&selected, &hosts).is_err());
    hosts.insert("scope.two".to_owned(), "file:///two".to_owned());
    assert_eq!(validate_selected(&selected, &hosts).unwrap(), ["scope.one", "scope.two"]);
}
