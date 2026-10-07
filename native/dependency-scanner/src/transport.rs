use crate::limits::REQUEST_BYTES;
use serde_json::Value;
use std::io::{self, BufRead, Write};

enum Input {
    Line(Vec<u8>),
    Oversized,
}

fn end_of_input(line: Vec<u8>, oversized: bool) -> Option<Input> {
    if oversized {
        return Some(Input::Oversized);
    }
    if line.is_empty() { None } else { Some(Input::Line(line)) }
}

fn append_chunk(line: &mut Vec<u8>, oversized: &mut bool, bytes: &[u8], limit: usize) {
    if !*oversized && line.len().saturating_add(bytes.len()) <= limit {
        line.extend_from_slice(bytes);
    } else {
        *oversized = true;
        line.clear();
    }
}

fn read_input(reader: &mut impl BufRead, limit: usize) -> io::Result<Option<Input>> {
    let mut line = Vec::new();
    let mut oversized = false;
    loop {
        let buffer = reader.fill_buf()?;
        if buffer.is_empty() {
            return Ok(end_of_input(line, oversized));
        }
        let newline = buffer
            .iter()
            .position(|byte| *byte == b'\n');
        let count = newline.map_or(buffer.len(), |position| position + 1);
        let content_count = newline.map_or(count, |position| position);
        append_chunk(&mut line, &mut oversized, &buffer[..content_count], limit);
        reader.consume(count);
        if newline.is_some() {
            return Ok(Some(if oversized { Input::Oversized } else { Input::Line(line) }));
        }
    }
}

pub(crate) fn invalid_request(message: &str) -> Value {
    serde_json::json!({"version":1,"status":"invalid_request","diagnostics":[message]})
}

pub(crate) fn serve(
    reader: &mut impl BufRead,
    writer: &mut impl Write,
    mut process: impl FnMut(&str) -> Result<Value, serde_json::Error>,
) -> io::Result<()> {
    while let Some(input) = read_input(reader, REQUEST_BYTES)? {
        let response = match input {
            Input::Oversized => invalid_request("request exceeds 8 MiB limit"),
            Input::Line(bytes) => match std::str::from_utf8(&bytes) {
                Ok(line) => process(line).map_err(io::Error::other)?,
                Err(_) => invalid_request("request is not UTF-8"),
            },
        };
        serde_json::to_writer(&mut *writer, &response)?;
        writeln!(writer)?;
        writer.flush()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests;

pub(crate) fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let threads = if args.is_empty() {
        std::thread::available_parallelism()?.get().min(8)
    } else if args.len() == 2 && args[0] == "--threads" {
        args[1].parse::<usize>()?
    } else {
        return Err("usage: bit-dependency-scanner [--threads 1..64]".into());
    };
    if !(1..=64).contains(&threads) {
        return Err("threads must be in 1..64".into());
    }
    let pool = rayon::ThreadPoolBuilder::new().num_threads(threads).build()?;
    let stdin = io::stdin();
    let mut stdout = io::BufWriter::new(io::stdout().lock());
    serve(&mut stdin.lock(), &mut stdout, |input| crate::protocol::process_request(input, &pool))?;
    Ok(())
}
