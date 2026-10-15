//! Group a lane's selected component closure and lane objects for one remote.
use super::{
    Pending, Plan, Prepare, Publication, lane_model::LaneSelected, lane_publication, remote,
};
use std::io;

pub(super) fn prepare(input: &Prepare, lane: LaneSelected) -> io::Result<Plan> {
    let host = remote::host(input, &lane.scope)?;
    let fork_history = host
        .starts_with("file://")
        .then(|| lane.fork_history.clone())
        .flatten();
    let prepared = lane_publication::prepare(input, &lane)?;
    let order = lane.components.ids
        .iter()
        .enumerate()
        .map(|(index, id)| (id.clone(), index))
        .collect();
    let name = format!("{}/{}", lane.scope, lane.name);
    let count = lane.components.ids.len();
    let pending = vec![Pending { scope: lane.scope, host, objects: lane.components.objects }];
    Ok(Plan {
        count,
        order,
        resume: None,
        publication: Some(Publication::Lane { prepared: Box::new(prepared), name }),
        pending,
        fork_history,
    })
}
