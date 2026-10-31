/// Mirror isbinaryfile 4.0.6's 512-byte classifier, including BOM early returns
/// and the deliberately limited two/three-byte UTF-8 detection.
pub(crate) fn binary(bytes: &[u8]) -> bool {
    if bytes.is_empty() || text_bom(bytes) {
        return false;
    }
    if bytes.starts_with(b"%PDF-") {
        return true;
    }
    suspicious_prefix(&bytes[..bytes.len().min(512)])
}

fn suspicious_prefix(bytes: &[u8]) -> bool {
    let total = bytes.len();
    let mut suspicious = 0_usize;
    let mut index = 0;
    while index < total {
        let byte = bytes[index];
        if byte == 0 {
            return true;
        }
        if ordinary(byte) || utf8_sequence(bytes, &mut index) {
            index += 1;
            continue;
        }
        suspicious += 1;
        if index > 32 && suspicious.saturating_mul(100) > total.saturating_mul(10) {
            return true;
        }
        index += 1;
    }
    suspicious.saturating_mul(100) > total.saturating_mul(10)
}

fn ordinary(byte: u8) -> bool {
    (7..=14).contains(&byte) || (32..=127).contains(&byte)
}

fn utf8_sequence(bytes: &[u8], index: &mut usize) -> bool {
    let byte = bytes[*index];
    if (194..224).contains(&byte) && *index + 1 < bytes.len() {
        *index += 1;
        return continuation(bytes[*index]);
    }
    if (224..240).contains(&byte) && *index + 2 < bytes.len() {
        *index += 1;
        if continuation(bytes[*index]) && continuation(bytes[*index + 1]) {
            *index += 1;
            return true;
        }
    }
    false
}

fn text_bom(bytes: &[u8]) -> bool {
    [
        b"\xef\xbb\xbf".as_slice(),
        b"\x00\x00\xfe\xff",
        b"\xff\xfe\x00\x00",
        b"\x84\x31\x95\x33",
        b"\xfe\xff",
        b"\xff\xfe",
    ]
    .iter()
    .any(|bom| bytes.starts_with(bom))
}
fn continuation(byte: u8) -> bool {
    (128..192).contains(&byte)
}

pub(crate) fn auto(bytes: Vec<u8>) -> Vec<u8> {
    normalize(bytes, cfg!(windows))
}

pub(crate) fn normalize(bytes: Vec<u8>, windows: bool) -> Vec<u8> {
    if bytes.is_empty()
        || (!bytes.contains(&b'\r') && (!windows || !bytes.contains(&b'\n')))
        || binary(&bytes)
    {
        return bytes;
    }
    let text = String::from_utf8_lossy(&bytes);
    let output = replace_newlines(&text, windows);
    if output == text { bytes } else { output.into_bytes() }
}

fn replace_newlines(text: &str, windows: bool) -> String {
    let mut characters = text.chars().peekable();
    let mut output = String::with_capacity(text.len());
    while let Some(character) = characters.next() {
        if character != '\r' && character != '\n' {
            output.push(character);
            continue;
        }
        if character == '\r' && characters.peek() == Some(&'\n') {
            characters.next();
        }
        if windows {
            output.push('\r');
        }
        output.push('\n');
    }
    output
}

#[cfg(test)]
mod tests;
