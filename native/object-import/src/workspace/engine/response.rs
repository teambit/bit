//! Bounded JSON response buffer for the workspace protocol.
use super::{MAX_OUTPUT, invalid};
use std::io::{self, Write};

pub(super) struct Output(pub(super) Vec<u8>);
impl Write for Output {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if self.0.len() + bytes.len() > MAX_OUTPUT {
            return Err(invalid("workspace output limit"));
        }
        self.0.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
