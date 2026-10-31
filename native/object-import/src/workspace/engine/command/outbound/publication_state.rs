//! The local publication that accompanies a component or lane export.

use super::{lane_publication, publication};

pub(super) enum Publication {
    Main(Box<publication::Prepared>),
    Lane { prepared: Box<lane_publication::Prepared>, name: String },
}

impl Publication {
    pub(super) fn lane_name(&self) -> Option<&str> {
        match self {
            Self::Main(_) => None,
            Self::Lane { name, .. } => Some(name),
        }
    }

    pub(super) fn non_existing_ids(&self) -> &[String] {
        match self {
            Self::Main(prepared) => prepared.non_existing_ids(),
            Self::Lane { prepared, .. } => prepared.non_existing_ids(),
        }
    }

    pub(super) fn receipt_ids(&self) -> (Vec<String>, Vec<String>) {
        match self {
            Self::Main(prepared) => (Vec::new(), prepared.removed_ids().to_vec()),
            Self::Lane { prepared, .. } => {
                (prepared.update_ids().to_vec(), prepared.removed_ids().to_vec())
            }
        }
    }
}

/// ExportMain.updateLocalObjects sorts unversioned identities within each export remote.
pub(super) fn components(retained: &super::Retained, exported_ids: &[String]) -> Vec<String> {
    let identities = exported_ids
        .iter()
        .map(|id| strip_exported_version(id))
        .filter(|id| !id.is_empty());
    if matches!(retained.publication, Some(Publication::Lane { .. })) {
        let mut ids = identities.collect::<Vec<_>>();
        ids.sort();
        ids.dedup();
        return ids;
    }
    let ids = identities.collect::<Vec<_>>();
    let mut result = Vec::new();
    for pending in &retained.pending {
        let mut group = ids
            .iter()
            .filter(|id| {
                id.split_once('/')
                    .is_some_and(|(scope, _)| scope == pending.scope.trim())
            })
            .cloned()
            .collect::<Vec<_>>();
        group.sort();
        group.dedup();
        result.extend(group);
    }
    result
}

fn strip_exported_version(id: &str) -> String {
    let trimmed = id.trim();
    let bare = match trimmed.rsplit_once('@') {
        Some((identity, _)) if !identity.trim().is_empty() => identity.trim(),
        _ => trimmed,
    };
    match bare.split_once('/') {
        Some((scope, name)) if !scope.trim().is_empty() && !name.trim().is_empty() => {
            format!("{}/{}", scope.trim(), name.trim())
        }
        _ => bare.to_owned(),
    }
}
