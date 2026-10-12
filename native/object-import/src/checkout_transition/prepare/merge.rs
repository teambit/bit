use super::{
    super::{invalid, plan, wire},
    current, sources,
};
use serde_json::{Value, json};
use std::io;
pub(super) fn rows(
    request: &wire::Prepare,
    current: &[current::Loaded],
    bodies: &mut Vec<plan::Body>,
    total: &mut usize,
    compressed: &mut usize,
) -> io::Result<Vec<Value>> {
    let Some(base) = &request.base else {
        return Ok(Vec::new());
    };
    let _base = sources::load(&request.objects_directory, base, total, compressed)?;
    let labels = request.labels.as_ref().ok_or_else(|| invalid("checkout merge labels missing"))?;
    let input = json!({"objectsDirectory":request.objects_directory,"labels":{"current":labels.current,"other":labels.other},"base":base.files.iter().map(|file|json!({"path":file.relative_path,"hash":file.hash})).collect::<Vec<_>>(),"other":request.target.files.iter().map(|file|json!({"path":file.relative_path,"hash":file.hash})).collect::<Vec<_>>(),"current":request.current.iter().map(|file|json!({"path":file.relative_path,"source":{"hash":file.snapshot_hash}})).collect::<Vec<_>>()});
    let merged = crate::merge_history::merge::frozen(
        input,
        &current
            .iter()
            .map(|file| file.normalized.clone())
            .collect::<Vec<_>>(),
    )?;
    let rows = merged["files"].as_array().ok_or_else(|| invalid("checkout merge rows missing"))?;
    let mut output = Vec::new();
    for row in rows {
        let mut row = row.clone();
        retain(&mut row, bodies)?;
        output.push(row);
    }
    Ok(output)
}
fn retain(row: &mut Value, bodies: &mut Vec<plan::Body>) -> io::Result<()> {
    for (field, output) in [
        ("body", "bodyPlanIndex"),
        ("output", "outputPlanIndex"),
        ("conflict", "conflictPlanIndex"),
    ] {
        retain_field(row, bodies, field, output)?;
        row.as_object_mut()
            .ok_or_else(|| invalid("checkout merge row"))?
            .shift_remove(field);
    }
    Ok(())
}
fn retain_field(
    row: &mut Value,
    bodies: &mut Vec<plan::Body>,
    field: &str,
    output: &str,
) -> io::Result<()> {
    let text = row
        .get(field)
        .and_then(Value::as_str)
        .map(str::to_owned);
    if let Some(text) = text {
        if field == "conflict" && text.is_empty() {
            row.as_object_mut()
                .ok_or_else(|| invalid("checkout merge row"))?
                .shift_remove(field);
            return Ok(());
        }
        let bytes = if field == "body" { hex(&text)? } else { text.into_bytes() };
        let index = bodies.len();
        bodies.push(plan::Body::new(bytes));
        row[output] = json!(index);
    }
    Ok(())
}
fn hex(text: &str) -> io::Result<Vec<u8>> {
    if !text.len().is_multiple_of(2) || text.len() > 64 * 1024 * 1024 {
        return Err(invalid("checkout merge body hex"));
    }
    text.as_bytes()
        .chunks_exact(2)
        .map(|part| {
            u8::from_str_radix(std::str::from_utf8(part).map_err(io::Error::other)?, 16)
                .map_err(io::Error::other)
        })
        .collect()
}
