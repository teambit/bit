//! `object-hash` serialization for the generated plain-object TypeScript configuration.
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::{fmt::Write as _, io};

const FUNCTION: &str = "fn:string:8:[native]string:20:function-name:Object";

pub(super) fn hash(value: &Value) -> io::Result<String> {
    if !value.is_object() {
        return Err(super::invalid("linter configuration root"));
    }
    let mut bytes = String::new();
    encode(value, &mut bytes, true)?;
    Ok(format!("{:x}", Sha1::digest(bytes.as_bytes())))
}

fn encode(value: &Value, output: &mut String, root: bool) -> io::Result<()> {
    match value {
        Value::String(value) => string(value, output),
        Value::Bool(value) => {
            let _ = write!(output, "bool:{value}");
        }
        Value::Null => output.push_str("Null"),
        Value::Array(values) => {
            if values.len() > 65536 {
                return Err(super::invalid("linter configuration array limit"));
            }
            let _ = write!(output, "array:{}:", values.len());
            for value in values {
                encode(value, output, false)?;
            }
        }
        Value::Object(values) => object(values, output, root)?,
        Value::Number(_) => return Err(super::invalid("linter configuration number")),
    }
    Ok(())
}

fn object(
    values: &serde_json::Map<String, Value>,
    output: &mut String,
    root: bool,
) -> io::Result<()> {
    let _ = write!(
        output,
        "object:{}:string:9:prototype:Undefined,string:9:__proto__:",
        values.len() + 3,
    );
    if root {
        output.push_str(
            "object:3:string:9:prototype:Undefined,string:9:__proto__:Null,string:11:constructor:",
        );
        output.push_str(FUNCTION);
        output.push_str("object:0:,");
    } else {
        string("[CIRCULAR:1]", output);
    }
    output.push_str(",string:11:constructor:");
    output.push_str(FUNCTION);
    string("[CIRCULAR:2]", output);
    output.push(',');
    let mut keys: Vec<_> = values.keys().collect();
    keys.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
    for key in keys {
        if matches!(key.as_str(), "prototype" | "__proto__" | "constructor") {
            return Err(super::invalid("linter configuration prototype"));
        }
        string(key, output);
        output.push(':');
        encode(&values[key], output, false)?;
        output.push(',');
    }
    Ok(())
}

fn string(value: &str, output: &mut String) {
    let _ = write!(output, "string:{}:{value}", value.encode_utf16().count());
}
