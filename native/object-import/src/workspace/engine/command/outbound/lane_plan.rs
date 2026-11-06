//! Group a [`LaneSelected`] component closure and [`lane_publication`] into a [`Plan`] via [`prepare`], [`Pending`], and [`parse_resume_id`].

use super::{
    Pending, Plan, Prepare, Publication, ResumeContext, invalid, lane_model::LaneSelected,
    lane_publication, remote,
};
use std::io;

/// Builds an outbound [`Plan`] for `lane` with resolved [`remote::host`], [`parse_resume_id`], and [`lane_publication`] state.
#[inline]
pub(super) fn prepare(input: &Prepare, lane: LaneSelected) -> io::Result<Plan> {
    let scope = lane.scope.trim();
    let lane_name = lane.name.trim();
    if scope.is_empty() || lane_name.is_empty() {
        return Err(invalid("outbound lane plan identity"));
    }
    let host = remote::host(input, scope)?;
    let prepared = lane_publication::prepare(input, &lane)?;
    let fork_history =
        (host.starts_with("file://") && !cfg!(windows)).then_some(lane.fork_history).flatten();
    let name = format!("{scope}/{lane_name}");
    let count = lane.components.ids.len();
    let resume = input.options.resume
        .as_deref()
        .map(str::trim)
        .filter(|resume| !resume.is_empty())
        .map(|_| {
            lane.components.expected_ids
                .iter()
                .map(|id| parse_resume_id(id))
                .collect::<io::Result<Vec<_>>>()
                .map(|selected| ResumeContext { selected })
        })
        .transpose()?;
    let pending = vec![Pending { scope: scope.to_owned(), host, objects: lane.components.objects }];
    Ok(Plan {
        count,
        resume,
        publication: Some(Publication::Lane { prepared: Box::new(prepared), name }),
        pending,
        fork_history,
        selection_history: super::model::prefilter::Prepared::default(),
    })
}

/// Parses a validated `(scope, name, version)` tuple from a `scope/name@version` resume identifier for [`ResumeContext`] in [`prepare`].
#[inline]
fn parse_resume_id(id: &str) -> io::Result<(String, String, String)> {
    let (identity, version) = id
        .trim()
        .rsplit_once('@')
        .map(|(identity, version)| (identity.trim(), version.trim()))
        .filter(|(_, version)| {
            !version.is_empty()
                && !matches!(*version, "." | "..")
                && !version.contains(['/', '\\'])
                && !version.chars().any(char::is_control)
        })
        .ok_or_else(|| invalid("outbound lane resume version"))?;
    let (scope, name) = identity
        .split_once('/')
        .map(|(scope, name)| (scope.trim(), name.trim()))
        .filter(|(scope, name)| {
            !scope.is_empty()
                && !name.is_empty()
                && !matches!(*scope, "." | "..")
                && !name
                    .split('/')
                    .any(|seg| seg.is_empty() || matches!(seg, "." | ".."))
                && !identity.contains('\\')
                && !identity.chars().any(char::is_control)
        })
        .ok_or_else(|| invalid("outbound lane resume identity"))?;
    Ok((scope.to_owned(), name.to_owned(), version.to_owned()))
}
