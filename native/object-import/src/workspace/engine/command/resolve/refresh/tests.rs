//! Unit tests for callback-owned [`SourceChange`] source [`proof`] replacement via [`replace_owned_proofs`].
//!
//! Verifies that callbacks can update only their owned source proofs and cannot tamper with unowned files.

use super::{SourceChange, replace_owned_proofs};
use crate::workspace::engine::{command::scratch::Directory, dependency_graph::proof};
use std::fs;

#[test]
fn callbacks_can_replace_only_their_validated_source_and_cannot_reset_other_proofs() {
    let directory = Directory::create().unwrap();
    let source = directory.0.join("source");
    let control = directory.0.join("control");
    fs::write(&source, b"before").unwrap();
    fs::write(&control, b"control").unwrap();
    let before = proof::content(&source, b"before");
    let mut proofs = vec![before.clone(), proof::content(&control, b"control")];
    fs::write(&source, b"after").unwrap();
    let change = SourceChange { before: before.clone(), after: proof::content(&source, b"after") };
    replace_owned_proofs(&mut proofs, &[before], &[change]).unwrap();
    proof::verify(&proofs).unwrap();
    fs::write(&control, b"unowned mutation").unwrap();
    assert!(replace_owned_proofs(&mut proofs, &[], &[]).is_err());
}

#[test]
fn unowned_sources_wrong_hashes_and_duplicate_changes_are_rejected() {
    let directory = Directory::create().unwrap();
    let source = directory.0.join("source");
    fs::write(&source, b"before").unwrap();
    let before = proof::content(&source, b"before");
    let mut proofs = vec![before.clone()];
    let change = SourceChange { before: before.clone(), after: proof::content(&source, b"before") };
    assert!(replace_owned_proofs(&mut proofs, &[], &[change]).is_err());
    let change =
        SourceChange { before: before.clone(), after: proof::content(&source, b"false bytes") };
    assert!(replace_owned_proofs(&mut proofs, std::slice::from_ref(&before), &[change]).is_err());
    let changes = [
        SourceChange { before: before.clone(), after: before.clone() },
        SourceChange { before: before.clone(), after: before.clone() },
    ];
    assert!(replace_owned_proofs(&mut proofs, &[before], &changes).is_err());
}

#[test]
fn empty_change_list_leaves_unmodified_proofs_intact() {
    let directory = Directory::create().unwrap();
    let source = directory.0.join("source");
    fs::write(&source, b"stable").unwrap();
    let initial = proof::content(&source, b"stable");
    let mut proofs = vec![initial.clone()];
    replace_owned_proofs(&mut proofs, &[initial], &[]).unwrap();
    assert_eq!(proofs.len(), 1);
    proof::verify(&proofs).unwrap();
}
