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

    pub(super) fn update_ids(&self) -> &[String] {
        match self {
            Self::Main(_) => &[],
            Self::Lane { prepared, .. } => prepared.update_ids(),
        }
    }
}
