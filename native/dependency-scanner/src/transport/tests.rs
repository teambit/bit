use super::{Input, read_input, serve};
use serde_json::json;
use std::io::{self, BufReader, Cursor, Write};

#[test]
fn oversized_lines_are_drained_and_next_request_survives() {
    let mut reader = BufReader::with_capacity(2, Cursor::new(b"123456789\nok\nlast"));
    assert!(matches!(read_input(&mut reader, 4).unwrap(), Some(Input::Oversized)));
    let Some(Input::Line(line)) = read_input(&mut reader, 4).unwrap() else {
        panic!("expected next request");
    };
    assert_eq!(line, b"ok");
    let Some(Input::Line(line)) = read_input(&mut reader, 4).unwrap() else {
        panic!("expected unterminated request");
    };
    assert_eq!(line, b"last");
    assert!(read_input(&mut reader, 4).unwrap().is_none());
}

#[test]
fn invalid_encoding_does_not_end_session() {
    let mut reader = Cursor::new(b"\xff\n{}\n");
    let mut output = Vec::new();
    serve(&mut reader, &mut output, |_| Ok(json!({"ok":true}))).unwrap();
    let responses: Vec<serde_json::Value> = String::from_utf8(output)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(responses[0]["status"], "invalid_request");
    assert_eq!(responses[1], json!({"ok":true}));
}

pub(super) struct BrokenWriter;
impl Write for BrokenWriter {
    fn write(&mut self, _: &[u8]) -> io::Result<usize> {
        Err(io::ErrorKind::BrokenPipe.into())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
#[test]
fn output_failure_terminates_session() {
    let error =
        serve(&mut Cursor::new(b"{}\n{}\n"), &mut BrokenWriter, |_| Ok(json!({}))).unwrap_err();
    assert_eq!(error.kind(), io::ErrorKind::BrokenPipe);
}

#[test]
fn oversized_actual_request_recovers_for_next_valid_line() {
    let mut bytes = vec![b' '; crate::limits::REQUEST_BYTES + 1];
    bytes.extend_from_slice(b"\n{}\n");
    let mut output = Vec::new();
    serve(&mut Cursor::new(bytes), &mut output, |_| Ok(json!({"ok":true}))).unwrap();
    let responses: Vec<serde_json::Value> = String::from_utf8(output)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(responses[0]["status"], "invalid_request");
    assert_eq!(responses[1], json!({"ok":true}));
}

struct BrokenReader;
impl io::Read for BrokenReader {
    fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
        Err(io::ErrorKind::PermissionDenied.into())
    }
}
#[test]
fn input_failure_terminates_session() {
    let error =
        serve(&mut BufReader::new(BrokenReader), &mut Vec::new(), |_| Ok(json!({}))).unwrap_err();
    assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
}
