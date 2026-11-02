//! 512-byte `USTAR` tar header encoding ([`encode`]) for object transfer archives.

use std::io;

/// Encodes a 512-byte `USTAR` tar header block for a transfer archive entry.
pub(super) fn encode(name: &str, size: usize, seconds: u32) -> io::Result<[u8; 512]> {
    let name = name.trim().trim_matches('/');
    if name.is_empty()
        || !name.is_ascii()
        || name.contains('\\')
        || name.bytes().any(|byte| byte.is_ascii_control())
        || name
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
        || seconds > i32::MAX as u32
    {
        return Err(super::invalid("unsupported tar header"));
    }
    let (prefix, name) = split(name)?;
    let mut block = [0; 512];
    copy(&mut block, 0, name.as_bytes());
    octal(&mut block, 100, 6, 0o644)?;
    octal(&mut block, 108, 6, 0)?;
    octal(&mut block, 116, 6, 0)?;
    octal(&mut block, 124, 11, size as u64)?;
    octal(&mut block, 136, 11, u64::from(seconds))?;
    block[156] = b'0';
    copy(&mut block, 257, b"ustar\x0000");
    octal(&mut block, 329, 6, 0)?;
    octal(&mut block, 337, 6, 0)?;
    copy(&mut block, 345, prefix.as_bytes());
    let checksum = block
        .iter()
        .map(|byte| u64::from(*byte))
        .sum::<u64>()
        + 256;
    octal(&mut block, 148, 6, checksum)?;
    Ok(block)
}

/// Splits a tar entry path into `(prefix, name)` components that fit within `USTAR` 155/100-byte limits.
fn split(mut name: &str) -> io::Result<(&str, &str)> {
    let original = name;
    let mut length = 0;
    while name.len() > 100 {
        let separator = name.find('/').ok_or_else(|| super::invalid("tar name requires PAX"))?;
        length += separator + 1;
        name = &name[separator + 1..];
    }
    let prefix = if length == 0 { "" } else { &original[..length - 1] };
    if prefix.len() > 155 {
        return Err(super::invalid("tar prefix requires PAX"));
    }
    Ok((prefix, name))
}

/// Copies `bytes` into `block` starting at `offset`.
#[inline]
fn copy(block: &mut [u8; 512], offset: usize, bytes: &[u8]) {
    block[offset..offset + bytes.len()].copy_from_slice(bytes);
}

/// Encodes `value` as an ASCII octal field of `digits` characters at `offset` in `block`.
#[inline]
fn octal(block: &mut [u8; 512], offset: usize, digits: usize, value: u64) -> io::Result<()> {
    if (value >> (digits * 3)) != 0 {
        return Err(super::invalid("tar numeric field exceeds bounds"));
    }
    for index in 0..digits {
        block[offset + digits - 1 - index] = b'0' + ((value >> (index * 3)) & 7) as u8;
    }
    block[offset + digits] = b' ';
    Ok(())
}
