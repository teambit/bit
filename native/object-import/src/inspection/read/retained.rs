use super::{hash, invalid, raw, wire};
use std::io;

pub(super) fn load(
    file: &wire::Input,
    maximum: usize,
    snapshots: Option<&crate::workspace::snapshots::State>,
) -> io::Result<(Vec<u8>, usize, String)> {
    let Some(token) = file.read_token else {
        let bytes = raw(&file.path, maximum)?;
        let length = bytes.len();
        let digest = hash(&bytes);
        return Ok((bytes, length, digest));
    };
    let expected =
        file.raw_hash.as_deref().ok_or_else(|| invalid("inspection retained raw hash"))?;
    crate::merge_history::hash(expected)?;
    let snapshot = snapshots
        .and_then(|state| state.get(token, &file.path, expected))
        .filter(|snapshot| {
            file.path.is_absolute()
                && snapshot.raw_bytes.max(snapshot.contents.len()) <= maximum
                && file.snapshot_hash.as_ref() == Some(&snapshot.snapshot_hash)
        })
        .ok_or_else(|| invalid("inspection retained workspace observation"))?;
    Ok((snapshot.contents.to_vec(), snapshot.raw_bytes, snapshot.raw_hash.clone()))
}
