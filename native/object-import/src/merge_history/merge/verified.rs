use super::{MAX_RAW, Prepared, Request, count, execute, hash, invalid, path, text};
use serde_json::Value;
use std::{collections::HashSet, io};
/// Inputs have already passed checkout manifest, Source identity and workspace snapshot verification.
pub(crate) fn verified(input: Value, prepared: &Prepared<'_>) -> io::Result<Value> {
    let request: Request = serde_json::from_value(input).map_err(io::Error::other)?;
    path(&request.objects_directory)?;
    text(&request.labels.current)?;
    text(&request.labels.other)?;
    validate_models(&request, prepared)?;
    count(request.current.len())?;
    if request.current.len() != prepared.current.len() {
        return Err(invalid("merge verified current count"));
    }
    let mut seen = HashSet::new();
    for file in &request.current {
        text(&file.path)?;
        if !seen.insert(&file.path) {
            return Err(invalid("merge duplicate current path"));
        }
    }
    if prepared.base
        .iter()
        .flatten()
        .chain(&prepared.other)
        .chain(&prepared.current)
        .map(|bytes| bytes.len())
        .sum::<usize>()
        > MAX_RAW
    {
        return Err(invalid("merge verified byte limit"));
    }
    execute(&request, prepared, false)
}

fn validate_models(request: &Request, prepared: &Prepared<'_>) -> io::Result<()> {
    for (models, bodies) in
        [(&request.base, prepared.base.len()), (&request.other, prepared.other.len())]
    {
        count(models.len())?;
        if models.len() != bodies {
            return Err(invalid("merge verified model count"));
        }
        let mut seen = HashSet::new();
        for model in models {
            text(&model.path)?;
            hash(&model.hash)?;
            if !seen.insert(&model.path) {
                return Err(invalid("merge duplicate model path"));
            }
        }
    }
    Ok(())
}
