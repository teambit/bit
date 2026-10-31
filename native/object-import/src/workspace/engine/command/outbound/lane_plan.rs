//! Group a lane's selected component closure and lane objects for one remote.
use super::{
    Pending, Plan, Prepare, Publication, ResumeContext, invalid, lane_model::LaneSelected,
    lane_publication, remote,
};
use std::io;

pub(super) fn prepare(input: &Prepare, lane: LaneSelected) -> io::Result<Plan> {
    let host = remote::host(input, &lane.scope)?;
    let fork_history = (host.starts_with("file://") && !cfg!(windows))
        .then(|| lane.fork_history.clone())
        .flatten();
    let prepared = lane_publication::prepare(input, &lane)?;
    let name = format!("{}/{}", lane.scope, lane.name);
    let count = lane.components.ids.len();
    let resume = input.options.resume
        .as_ref()
        .map(|_| {
            lane.components.expected_ids
                .iter()
                .map(|id| parse_resume_id(id))
                .collect::<io::Result<Vec<_>>>()
                .map(|selected| ResumeContext { selected })
        })
        .transpose()?;
    let pending = vec![Pending { scope: lane.scope, host, objects: lane.components.objects }];
    Ok(Plan {
        count,
        resume,
        publication: Some(Publication::Lane { prepared: Box::new(prepared), name }),
        pending,
        fork_history,
        selection_history: super::model::prefilter::Prepared::default(),
    })
}

fn parse_resume_id(id: &str) -> io::Result<(String, String, String)> {
    let (identity, version) = id
        .trim()
        .rsplit_once('@')
        .map(|(identity, version)| (identity.trim(), version.trim()))
        .filter(|(_, version)| !version.is_empty())
        .ok_or_else(|| invalid("outbound lane resume version"))?;
    let (scope, name) = identity
        .split_once('/')
        .map(|(scope, name)| (scope.trim(), name.trim()))
        .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
        .ok_or_else(|| invalid("outbound lane resume identity"))?;
    Ok((scope.to_owned(), name.to_owned(), version.to_owned()))
}
