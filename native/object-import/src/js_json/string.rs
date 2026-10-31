use std::io;

use super::writer::Writer;

pub(super) fn write(writer: &mut Writer, units: &[u16]) -> io::Result<()> {
    if units.is_empty() {
        return writer.bytes(b"\"\"");
    }
    writer.bytes(b"\"")?;
    let mut units = units.iter().copied().peekable();
    while let Some(unit) = units.next() {
        if (0xd800..=0xdbff).contains(&unit)
            && units
                .peek()
                .is_some_and(|next| (0xdc00..=0xdfff).contains(next))
        {
            let low = units.next().expect("peeked low surrogate");
            let scalar = 0x10000 + ((u32::from(unit) - 0xd800) << 10) + u32::from(low) - 0xdc00;
            unicode(writer, scalar)?;
        } else {
            single(writer, unit)?;
        }
    }
    writer.bytes(b"\"")
}

fn single(writer: &mut Writer, unit: u16) -> io::Result<()> {
    let escaped = match unit {
        8 => Some(b"\\b".as_slice()),
        9 => Some(b"\\t".as_slice()),
        10 => Some(b"\\n".as_slice()),
        12 => Some(b"\\f".as_slice()),
        13 => Some(b"\\r".as_slice()),
        34 => Some(b"\\\"".as_slice()),
        92 => Some(b"\\\\".as_slice()),
        _ => None,
    };
    if let Some(escaped) = escaped {
        return writer.bytes(escaped);
    }
    if unit < 32 || (0xd800..=0xdfff).contains(&unit) {
        return writer.bytes(format!(r"\u{unit:04x}").as_bytes());
    }
    unicode(writer, u32::from(unit))
}

fn unicode(writer: &mut Writer, scalar: u32) -> io::Result<()> {
    let mut buffer = [0; 4];
    let character = char::from_u32(scalar).expect("validated Unicode scalar");
    writer.bytes(character.encode_utf8(&mut buffer).as_bytes())
}
