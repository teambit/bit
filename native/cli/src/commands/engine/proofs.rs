//! Deduplicate identical read receipts and validate bounded protocol frames before publication.
#[cfg(test)]
mod tests;

use super::{Engine, MAX_REQUEST};
use serde_json::{Value, json};
use std::{collections::HashSet, io, ops::Range};

// The native proof verifier bounds each request independently of its byte frame.
const MAX_PROOFS: usize = 16384;

impl Engine {
    pub(in crate::commands) fn validate_read_set(
        &mut self,
        proofs: &[Value],
        stale: &str,
    ) -> io::Result<()> {
        let mut seen = HashSet::new();
        let unique = proofs
            .iter()
            .filter(|proof| seen.insert(*proof))
            .collect::<Vec<_>>();
        let frames = frames(&unique)?;
        crate::trace::log(format!(
            "dependency proofs: {} receipts, {} distinct, {} frame(s)",
            proofs.len(),
            unique.len(),
            frames.len(),
        ));
        for frame in frames {
            let result: Value =
                self.request(&json!({"kind":"dependencyFreshValidate","readSet":unique[frame]}))?;
            if result["fresh"] != true {
                return Err(io::Error::other(stale.to_owned()));
            }
        }
        Ok(())
    }
}

fn frames(proofs: &[&Value]) -> io::Result<Vec<Range<usize>>> {
    let overhead =
        serde_json::to_vec(&json!({"kind":"dependencyFreshValidate","readSet":[]}))?.len();
    let mut output = Vec::new();
    let mut start = 0;
    let mut bytes = overhead;
    for (index, proof) in proofs.iter().enumerate() {
        let length = serde_json::to_vec(proof)?.len();
        if length > MAX_REQUEST - overhead {
            return Err(io::Error::other("status input limit"));
        }
        if index - start == MAX_PROOFS || bytes + length + usize::from(index > start) > MAX_REQUEST
        {
            output.push(start..index);
            start = index;
            bytes = overhead;
        }
        bytes += length + usize::from(index > start);
    }
    if start < proofs.len() {
        output.push(start..proofs.len());
    }
    Ok(output)
}
