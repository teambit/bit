use super::{invalid, plan, wire};
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::{self, Write},
    path::PathBuf,
};
pub(super) fn apply(input: Value, state: &plan::State) -> io::Result<Value> {
    let request: wire::Materialize = serde_json::from_value(input).map_err(io::Error::other)?;
    let plan = state.plans
        .get(&request.token)
        .ok_or_else(|| invalid("stale checkout materialize token"))?;
    let contents = prepare(&request, plan)?;
    let mut completed = 0;
    let mut skipped = Vec::new();
    let mut directories = HashSet::new();
    for (index, (file, body)) in request.files
        .iter()
        .zip(&contents)
        .enumerate()
    {
        if !file.overwrite && fs::metadata(&file.path).is_ok() {
            completed += 1;
            skipped.push(index);
            continue;
        }
        if write(file, body, &mut directories).is_err() {
            break;
        }
        completed += 1;
    }
    Ok(json!({"completed":completed,"skipped":skipped,"failed":completed!=request.files.len()}))
}
fn prepare(request: &wire::Materialize, plan: &plan::Plan) -> io::Result<Vec<Vec<u8>>> {
    if request.files.len() > 4096 {
        return Err(invalid("checkout materialize file limit"));
    }
    let mut contents = Vec::new();
    let mut total = 0_usize;
    let mut paths = HashSet::new();
    for file in &request.files {
        if !file.path.is_absolute()
            || file.path
                .to_str()
                .is_none_or(|path| path.len() > 32768 || path.contains('\0'))
            || !paths.insert(&file.path)
            || !file.eol.trim().eq_ignore_ascii_case("auto")
        {
            return Err(invalid("checkout materialize unsupported destination"));
        }
        let body = plan.bodies
            .get(file.plan_index)
            .ok_or_else(|| invalid("checkout materialize body index"))?;
        let body = crate::checkout::eol::auto(body.contents.clone());
        total = total.saturating_add(body.len());
        if total > 32 * 1024 * 1024 {
            return Err(invalid("checkout materialize byte limit"));
        }
        contents.push(body);
    }
    Ok(contents)
}
fn write(
    file: &wire::Destination,
    body: &[u8],
    directories: &mut HashSet<PathBuf>,
) -> io::Result<()> {
    let parent =
        file.path.parent().ok_or_else(|| invalid("checkout materialize destination parent"))?;
    if !directories.contains(parent) {
        fs::create_dir_all(parent)?;
        directories.insert(parent.to_path_buf());
    }
    OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&file.path)?
        .write_all(body)
}
