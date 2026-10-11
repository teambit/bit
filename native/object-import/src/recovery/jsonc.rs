use super::invalid;
use serde_json::Value;
use std::io;

/// The native eligibility subset accepts JSON plus comments and trailing commas.
/// Other comment-json syntax declines so canonical parsing owns its public errors.
pub(super) fn parse(bytes: &[u8]) -> io::Result<Value> {
    std::str::from_utf8(bytes).map_err(io::Error::other)?;
    let clean = comments(bytes)?;
    serde_json::from_slice(&commas(&clean)).map_err(io::Error::other)
}
fn comments(bytes: &[u8]) -> io::Result<Vec<u8>> {
    let mut output: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0;
    let mut string = false;
    while index < bytes.len() {
        match bytes[index] {
            b'"' => {
                string = !string;
                output.push(bytes[index]);
            }
            b'\\' if string => {
                output.push(bytes[index]);
                index += 1;
                output.push(*bytes.get(index).ok_or_else(|| invalid("JSONC escape"))?);
            }
            b'/' if !string => {
                index = comment(bytes, index, &mut output)?;
                continue;
            }
            byte => output.push(byte),
        }
        index += 1;
    }
    Ok(output)
}
fn comment(bytes: &[u8], index: usize, output: &mut Vec<u8>) -> io::Result<usize> {
    let mut cursor = index + 2;
    match bytes.get(index + 1) {
        Some(b'/') => {
            while cursor < bytes.len() && bytes[cursor] != b'\n' {
                cursor += 1;
            }
        }
        Some(b'*') => {
            while cursor + 1 < bytes.len() && &bytes[cursor..cursor + 2] != b"*/" {
                cursor += 1;
            }
            if cursor + 1 == bytes.len() || cursor >= bytes.len() {
                return Err(invalid("JSONC comment"));
            }
            cursor += 2;
        }
        _ => return Err(invalid("JSONC slash")),
    }
    output.push(b' ');
    Ok(cursor)
}
fn commas(bytes: &[u8]) -> Vec<u8> {
    let mut output: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut string = false;
    let mut escaped = false;
    for (index, byte) in bytes.iter().copied().enumerate() {
        if !string
            && byte == b','
            && trailing(&bytes[index + 1..])
            && output
                .iter()
                .rev()
                .find(|byte| !byte.is_ascii_whitespace())
                .is_some_and(|byte| !matches!(byte, b'{' | b'[' | b':' | b','))
        {
            continue;
        }
        output.push(byte);
        if string && escaped {
            escaped = false;
            continue;
        }
        match byte {
            b'"' => string = !string,
            b'\\' if string => escaped = true,
            _ => {}
        }
    }
    output
}
fn trailing(bytes: &[u8]) -> bool {
    bytes
        .iter()
        .find(|byte| !byte.is_ascii_whitespace())
        .is_some_and(|byte| matches!(byte, b'}' | b']'))
}
