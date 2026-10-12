use super::Value;
use serde::{
    Deserialize, Deserializer,
    de::{SeqAccess, Visitor},
};
use std::fmt;

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
