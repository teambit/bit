use crate::{
    limits::REQUEST_BYTES,
    timings::{Metrics, Profile, Stage, measure},
};
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
    serve_profiled(reader, writer, &mut io::sink(), false, |input, _| process(input))
}
fn response_for_input(
    input: Input,
    metrics: Option<&Metrics>,
    process: &mut impl FnMut(&str, Option<&Metrics>) -> Result<Value, serde_json::Error>,
) -> io::Result<Value> {
    match input {
        Input::Oversized => Ok(invalid_request("request exceeds 8 MiB limit")),
        Input::Line(bytes) => match measure(metrics, Stage::Decode, || std::str::from_utf8(&bytes))
        {
            Ok(line) => process(line, metrics).map_err(io::Error::other),
            Err(_) => Ok(invalid_request("request is not UTF-8")),
        },
    }
}
pub(crate) fn serve_profiled(
    reader: &mut impl BufRead,
    writer: &mut impl Write,
    diagnostics: &mut impl Write,
    enabled: bool,
    mut process: impl FnMut(&str, Option<&Metrics>) -> Result<Value, serde_json::Error>,
) -> io::Result<()> {
    let mut request_index = 0_u64;
    while let Some(input) = read_input(reader, REQUEST_BYTES)? {
        let profile = enabled.then(Profile::new);
        let metrics = profile.as_ref().map(Profile::metrics);
        let response = response_for_input(input, metrics, &mut process)?;
        measure(metrics, Stage::Serialize, || serde_json::to_writer(&mut *writer, &response))?;
        writeln!(writer)?;
        writer.flush()?;
        if let Some(profile) = profile {
            request_index = request_index.saturating_add(1);
            profile.emit(diagnostics, &response, request_index)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;
#[cfg(test)]
mod timings_tests;

struct Options {
    threads: usize,
    timings: bool,
}
fn options(args: &[String]) -> Result<Options, Box<dyn std::error::Error>> {
    let mut arguments = args.iter();
    let mut threads = None;
    let mut timings = false;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--threads" if threads.is_none() => {
                let value = arguments.next().ok_or("--threads requires a value")?;
                threads = Some(value.parse::<usize>()?);
            }
            "--timings" if !timings => timings = true,
            _ => return Err("usage: bit-dependency-scanner [--threads 1..64] [--timings]".into()),
        }
    }
    let threads = match threads {
        Some(threads) => threads,
        None => std::thread::available_parallelism()?.get().min(8),
    };
    if !(1..=64).contains(&threads) {
        return Err("threads must be in 1..64".into());
    }
    Ok(Options { threads, timings })
}
pub(crate) fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let options = options(&args)?;
    let pool = rayon::ThreadPoolBuilder::new().num_threads(options.threads).build()?;
    let stdin = io::stdin();
    let mut stdout = io::BufWriter::new(io::stdout().lock());
    if options.timings {
        serve_profiled(
            &mut stdin.lock(),
            &mut stdout,
            &mut io::stderr().lock(),
            true,
            |input, metrics| crate::protocol::process_with_metrics(input, &pool, metrics),
        )?;
    } else {
        serve(&mut stdin.lock(), &mut stdout, |input| {
            crate::protocol::process_request(input, &pool)
        })?;
    }
    Ok(())
}
