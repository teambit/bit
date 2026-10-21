use super::{Selected, prepare_refs, validate_selected};
use crate::workspace::engine::command::outbound::model::{HistoryBytes, ModelBytes};
use serde_json::{Value, json};
use std::collections::HashMap;

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

#[test]
fn validates_host_for_every_selected_scope() {
    let selected = [selected("scope.one", "one", "111"), selected("scope.two", "two", "222")];
    let mut hosts = HashMap::from([("scope.one".to_owned(), "file:///one".to_owned())]);
    assert!(validate_selected(&selected, &hosts).is_err());
    hosts.insert("scope.two".to_owned(), "file:///two".to_owned());
    assert_eq!(validate_selected(&selected, &hosts).unwrap(), ["scope.one", "scope.two"]);
}
