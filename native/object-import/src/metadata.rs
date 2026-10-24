use flate2::{Decompress, FlushDecompress, Status};

pub(crate) const MAX_BYTES: usize = 256 * 1024;

// Only losslessly decoded, completely terminated streams can bypass Node inflation.
pub(crate) fn inflate(compressed: &[u8]) -> Option<String> {
    let mut decoder = Decompress::new(true);
    let mut chunk = vec![0; 64 * 1024].into_boxed_slice();
    let mut output = Vec::new();
    loop {
        let before_in = decoder.total_in();
        let before_out = decoder.total_out();
        let status = decoder
            .decompress(&compressed[before_in as usize..], &mut chunk, FlushDecompress::None)
            .ok()?;
        let count = (decoder.total_out() - before_out) as usize;
        if output.len() + count > MAX_BYTES {
            return None;
        }
        output.extend_from_slice(&chunk[..count]);
        if status == Status::StreamEnd {
            break;
        }
        if decoder.total_in() == before_in && count == 0 {
            return None;
        }
    }
    if decoder.total_in() != compressed.len() as u64 {
        return None;
    }
    String::from_utf8(output).ok()
}

#[cfg(test)]
mod tests;
