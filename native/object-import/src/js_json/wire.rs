use super::Value;
use serde::{
    Deserialize, Deserializer,
    de::{MapAccess, SeqAccess, Visitor, value::MapAccessDeserializer},
};
use std::fmt;

// The tagged form remains accepted and serialized for existing callers and responses.
#[derive(Deserialize)]
#[serde(
    remote = "Value",
    tag = "kind",
    content = "value",
    rename_all = "camelCase",
    deny_unknown_fields
)]
enum TaggedValue {
    Undefined,
    Null,
    Boolean(bool),
    Number(String),
    String(#[serde(deserialize_with = "text")] Vec<u16>),
    Array(Vec<Value>),
    Object(#[serde(deserialize_with = "entries")] Vec<(Vec<u16>, Value)>),
}

struct ValueVisitor;
impl<'de> Visitor<'de> for ValueVisitor {
    type Value = Value;
    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a tagged JavaScript value or compact null, boolean, string, or array")
    }
    fn visit_unit<Error: serde::de::Error>(self) -> Result<Value, Error> {
        Ok(Value::Null)
    }
    fn visit_bool<Error: serde::de::Error>(self, value: bool) -> Result<Value, Error> {
        Ok(Value::Boolean(value))
    }
    fn visit_str<Error: serde::de::Error>(self, value: &str) -> Result<Value, Error> {
        Ok(Value::String(value.encode_utf16().collect()))
    }
    fn visit_seq<Sequence: SeqAccess<'de>>(
        self,
        mut sequence: Sequence,
    ) -> Result<Value, Sequence::Error> {
        let mut values = Vec::new();
        while let Some(value) = sequence.next_element()? {
            values.push(value);
        }
        Ok(Value::Array(values))
    }
    fn visit_map<Map: MapAccess<'de>>(self, map: Map) -> Result<Value, Map::Error> {
        TaggedValue::deserialize(MapAccessDeserializer::new(map))
    }
}
impl<'de> Deserialize<'de> for Value {
    fn deserialize<Input: Deserializer<'de>>(input: Input) -> Result<Self, Input::Error> {
        input.deserialize_any(ValueVisitor)
    }
}

struct Utf16(Vec<u16>);
struct TextVisitor;
impl<'de> Visitor<'de> for TextVisitor {
    type Value = Utf16;
    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a Unicode string or UTF-16 code-unit array")
    }
    fn visit_str<Error: serde::de::Error>(self, value: &str) -> Result<Utf16, Error> {
        Ok(Utf16(value.encode_utf16().collect()))
    }
    fn visit_seq<Sequence: SeqAccess<'de>>(
        self,
        mut sequence: Sequence,
    ) -> Result<Utf16, Sequence::Error> {
        let mut units = Vec::new();
        while let Some(unit) = sequence.next_element::<u16>()? {
            units.push(unit);
        }
        Ok(Utf16(units))
    }
}
impl<'de> Deserialize<'de> for Utf16 {
    fn deserialize<Input: Deserializer<'de>>(input: Input) -> Result<Self, Input::Error> {
        input.deserialize_any(TextVisitor)
    }
}
pub(super) fn text<'de, Input: Deserializer<'de>>(input: Input) -> Result<Vec<u16>, Input::Error> {
    Ok(Utf16::deserialize(input)?.0)
}
pub(super) fn entries<'de, Input: Deserializer<'de>>(
    input: Input,
) -> Result<Vec<(Vec<u16>, Value)>, Input::Error> {
    Ok(Vec::<(Utf16, Value)>::deserialize(input)?
        .into_iter()
        .map(|(key, value)| (key.0, value))
        .collect())
}

#[cfg(test)]
#[path = "wire/tests.rs"]
mod tests;
