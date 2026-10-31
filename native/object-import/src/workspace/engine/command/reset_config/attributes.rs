use super::invalid;
use std::{
    fs, io,
    path::Path,
    sync::atomic::{AtomicUsize, Ordering},
};
static NEXT: AtomicUsize = AtomicUsize::new(0);

pub(super) fn validate(path: &Path) -> io::Result<()> {
    let meta = fs::symlink_metadata(path)?;
    if meta.file_type().is_symlink() || !meta.is_file() || has_non_selinux_xattr(path)? {
        return Err(invalid("reset config extended attributes"));
    }
    let parent = path.parent().ok_or_else(|| invalid("reset config parent"))?;
    let temporary = parent.join(format!(
        ".bit-reset-config-probe-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed),
    ));
    let file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)?;
    let result = equivalent(path, &temporary);
    drop(file);
    let removed = fs::remove_file(&temporary);
    result.and(removed)
}

fn has_non_selinux_xattr(path: &Path) -> io::Result<bool> {
    Ok(xattr::list(path)?.any(|name| name != "security.selinux"))
}

fn equivalent(original: &Path, temporary: &Path) -> io::Result<()> {
    if has_non_selinux_xattr(temporary)?
        || xattr::get(original, "security.selinux")? != xattr::get(temporary, "security.selinux")?
    {
        return Err(invalid("reset config nondefault metadata attributes"));
    }
    Ok(())
}
