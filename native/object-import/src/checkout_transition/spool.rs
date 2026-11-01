//! Packed checkout plan body spooling into temporary `.checkout-pack` files.

use super::plan::Body;
use std::{
    fs::OpenOptions,
    io::{self, BufWriter, Write},
    path::Path,
};
#[inline]
pub(super) fn assign(bodies: &mut [Body], directory: &Path, token: &str, first: usize) {
    if bodies.is_empty() {
        return;
    }
    let token = token.trim();
    let path = directory
        .components()
        .collect::<std::path::PathBuf>()
        .join(format!("{token}-{first}.checkout-pack"));
    let mut offset = 0_usize;
    for body in bodies {
        body.path.clone_from(&path);
        body.offset = Some(offset);
        offset = offset.saturating_add(body.contents.len());
    }
}
#[inline]
pub(super) fn write(bodies: &[Body]) -> io::Result<()> {
    let Some(first) = bodies.first() else {
        return Ok(());
    };
    if first.offset.is_none() {
        return bodies.iter().try_for_each(Body::spool);
    }
    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&first.path)?;
    let mut output = BufWriter::new(file);
    for body in bodies {
        output.write_all(&body.contents)?;
    }
    output.flush()
}
