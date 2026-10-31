use crate::{
    command_import,
    workspace::engine::{
        command::{
            State,
            lane_history::{Phase, Prepare, Retained},
        },
        dependency_graph::proof,
        hash, invalid,
    },
};
use serde_json::{Value, json};
use std::io;

pub(super) fn run(
    input: Prepare,
    state: &mut State,
    lane_id: command_import::lane::Id,
    lane_hash: &str,
    phases: Vec<Phase>,
) -> io::Result<(usize, Value)> {
    let lane_hash = lane_hash.trim().to_owned();
    let proofs = proofs(&input, &lane_hash)?;
    state.sequence =
        state.sequence.checked_add(1).ok_or_else(|| invalid("history sequence limit"))?;
    let token = hash(format!("history:{}:{}", std::process::id(), state.sequence).as_bytes());
    let output = json!({"historyToken":token,"laneId":format!("{}/{}",lane_id.scope.trim(),lane_id.name.trim()),"phases":phases.iter().enumerate().map(|(index,phase)|phase.receipt(index)).collect::<Vec<_>>(),"progress":{"imports":[]}});
    let count = phases.len();
    state.histories.checkout = Some(Box::new(Retained {
        root: input.root,
        token,
        lane_id,
        lane_hash,
        phases,
        next: 0,
        proofs,
    }));
    Ok((count, output))
}
fn proofs(input: &Prepare, lane_hash: &str) -> io::Result<Vec<proof::Proof>> {
    let lane_hash = lane_hash.trim();
    crate::merge_history::hash(lane_hash)?;
    let mut proofs = Vec::new();
    proof::read(&input.root.join(".bitmap"), &mut proofs)?;
    for hash in [lane_hash, &crate::lane_history::hash(lane_hash)] {
        let directory = crate::scope_path(&input.root).join("objects");
        proof::read(
            &directory
                .join(&hash[..2])
                .join(&hash[2..]),
            &mut proofs,
        )?;
    }
    Ok(proofs)
}
