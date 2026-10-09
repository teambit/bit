use std::{
    fs::File,
    io::{self, Read},
    path::Path,
};

pub(crate) const REQUEST_BYTES: usize = 8 * 1024 * 1024;
pub(crate) const SOURCE_BYTES: usize = 1024 * 1024;
pub(crate) const BATCH_FILES: usize = 4096;

pub(crate) fn read_source(path: &Path) -> io::Result<String> {
    let file = File::open(path)?;
    let mut bytes = Vec::new();
    file.take((SOURCE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > SOURCE_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::FileTooLarge,
            "source exceeds 1 MiB limit; use legacy fallback",
        ));
    }
    String::from_utf8(bytes).map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

pub(crate) fn source<'source>(
    inline: Option<&'source str>,
    path: &Path,
) -> io::Result<std::borrow::Cow<'source, str>> {
    match inline {
        Some(source) => Ok(std::borrow::Cow::Borrowed(source)),
        None => read_source(path).map(std::borrow::Cow::Owned),
    }
}
