use std::io;

use super::{Value, invalid, number, object, string};

const MAX_BYTES: usize = 32 * 1024 * 1024;
const MAX_NODES: usize = 262_144;

pub(super) struct Writer {
    output: Vec<u8>,
    nodes: usize,
    pretty: bool,
    spaces: usize,
}

impl Writer {
    pub(super) fn new(pretty: bool) -> Self {
        Self { output: Vec::new(), nodes: 0, pretty, spaces: 2 }
    }

    pub(super) fn spacing(&mut self, spaces: usize) {
        self.spaces = spaces;
    }

    pub(super) fn finish(self) -> Vec<u8> {
        self.output
    }

    pub(super) fn bytes(&mut self, bytes: &[u8]) -> io::Result<()> {
        if bytes.len() > MAX_BYTES - self.output.len() {
            return Err(invalid("JSON output limit"));
        }
        self.output.extend_from_slice(bytes);
        Ok(())
    }

    pub(super) fn value(&mut self, value: &Value, depth: usize) -> io::Result<()> {
        self.nodes += 1;
        if depth > 64 || self.nodes > MAX_NODES {
            return Err(invalid("JSON nesting or node limit"));
        }
        match value {
            Value::Undefined | Value::Null => self.bytes(b"null"),
            Value::Boolean(true) => self.bytes(b"true"),
            Value::Boolean(false) => self.bytes(b"false"),
            Value::Number(bits) => self.numeric(bits),
            Value::String(units) => string::write(self, units),
            Value::Array(values) => self.array(values, depth),
            Value::Object(fields) => self.object(fields, depth),
        }
    }

    fn numeric(&mut self, bits: &str) -> io::Result<()> {
        let value = number(bits)?;
        if !value.is_finite() {
            return self.bytes(b"null");
        }
        self.bytes(ryu_js::Buffer::new().format_finite(value).as_bytes())
    }

    fn array(&mut self, values: &[Value], depth: usize) -> io::Result<()> {
        self.bytes(b"[")?;
        for (index, value) in values.iter().enumerate() {
            self.separator(index, depth + 1)?;
            self.value(value, depth + 1)?;
        }
        self.close(b"]", !values.is_empty(), depth)
    }

    fn object(&mut self, fields: &[(Vec<u16>, Value)], depth: usize) -> io::Result<()> {
        let entries = object::entries(fields)?;
        self.bytes(b"{")?;
        for (index, (key, value)) in entries.iter().enumerate() {
            self.separator(index, depth + 1)?;
            string::write(self, key)?;
            self.bytes(if self.pretty { b": " } else { b":" })?;
            self.value(value, depth + 1)?;
        }
        self.close(b"}", !entries.is_empty(), depth)
    }

    fn separator(&mut self, index: usize, depth: usize) -> io::Result<()> {
        if index > 0 {
            self.bytes(b",")?;
        }
        if self.pretty {
            self.indent(depth)?;
        }
        Ok(())
    }

    fn close(&mut self, close: &[u8], nonempty: bool, depth: usize) -> io::Result<()> {
        if nonempty && self.pretty {
            self.indent(depth)?;
        }
        self.bytes(close)
    }

    fn indent(&mut self, depth: usize) -> io::Result<()> {
        self.bytes(b"\n")?;
        self.bytes(&vec![b' '; depth.saturating_mul(self.spaces.min(10))])
    }
}
