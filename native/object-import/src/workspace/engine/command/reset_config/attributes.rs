use super::invalid;
use std::{
    fs, io,
    path::Path,
    sync::atomic::{AtomicUsize, Ordering},
};
static NEXT: AtomicUsize = AtomicUsize::new(0);

pub(super) fn validate(path: &Path) -> io::Result<()> {
    if xattr::list(path)?.any(|name| name != "security.selinux") {
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

fn equivalent(original: &Path, temporary: &Path) -> io::Result<()> {
    if xattr::list(temporary)?.any(|name| name != "security.selinux")
        || xattr::get(original, "security.selinux")? != xattr::get(temporary, "security.selinux")?
    {
        return Err(invalid("reset config nondefault metadata attributes"));
    }
    Ok(())
}
