use indexmap::IndexMap;
use serde_json::{Map, Number, Value};
use std::collections::HashMap;

/// A comment as comment-json records it: `value` is the text between the
/// delimiters, `inline` whether it starts on the line the previous token ended on.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Comment {
    pub block: bool,
    pub value: String,
    pub inline: bool,
}

/// Comments keyed like comment-json's symbols: `before`, `after`,
/// `before:<key>`, `after-prop:<key>`, `after-colon:<key>`, `after-value:<key>`
/// and `after:<key>`. They are keyed by property name, independent of the
/// entries, so a deleted and re-added property gets its comments back.
pub type Comments = HashMap<String, Vec<Comment>>;

/// A parsed JSONC value that keeps its comments.
#[derive(Debug, Clone, PartialEq)]
pub enum Node {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<Node>, Comments),
    Object(Object),
}

/// A JSONC object. `entries` keeps insertion order; serialization applies
/// JavaScript's property order (array indexes first).
#[derive(Debug, Default, Clone, PartialEq)]
pub struct Object {
    pub entries: IndexMap<String, Node>,
    pub comments: Comments,
}

impl Object {
    /// Keys in JavaScript `Object.keys` order: canonical array indexes
    /// ascending, then the rest in insertion order.
    #[must_use]
    pub fn ordered_keys(&self) -> Vec<&String> {
        let mut indexes: Vec<(u32, &String)> = self.entries
            .keys()
            .filter_map(|key| array_index(key).map(|index| (index, key)))
            .collect();
        indexes.sort_by_key(|(index, _)| *index);
        let rest = self.entries
            .keys()
            .filter(|key| array_index(key).is_none());
        indexes
            .into_iter()
            .map(|(_, key)| key)
            .chain(rest)
            .collect()
    }
}

fn array_index(key: &str) -> Option<u32> {
    if key.is_empty()
        || (key.len() > 1 && key.starts_with('0'))
        || !key.bytes().all(|byte| byte.is_ascii_digit())
    {
        return None;
    }
    key.parse::<u32>()
        .ok()
        .filter(|&index| index != u32::MAX)
}

impl Node {
    /// The plain JSON value, without comments.
    #[must_use]
    pub fn to_value(&self) -> Value {
        match self {
            Self::Null => Value::Null,
            Self::Bool(value) => Value::Bool(*value),
            Self::Number(value) => number(*value),
            Self::String(value) => Value::String(value.clone()),
            Self::Array(items, _) => Value::Array(
                items
                    .iter()
                    .map(Self::to_value)
                    .collect(),
            ),
            Self::Object(object) => {
                let map: Map<String, Value> = object
                    .ordered_keys()
                    .into_iter()
                    .map(|key| (key.clone(), object.entries[key].to_value()))
                    .collect();
                Value::Object(map)
            }
        }
    }

    /// A node without comments.
    #[must_use]
    pub fn from_value(value: &Value) -> Self {
        match value {
            Value::Null => Self::Null,
            Value::Bool(value) => Self::Bool(*value),
            Value::Number(value) => Self::Number(value.as_f64().unwrap_or(f64::NAN)),
            Value::String(value) => Self::String(value.clone()),
            Value::Array(items) => Self::Array(
                items
                    .iter()
                    .map(Self::from_value)
                    .collect(),
                Comments::new(),
            ),
            Value::Object(map) => Self::Object(Object {
                entries: map
                    .iter()
                    .map(|(key, value)| (key.clone(), Self::from_value(value)))
                    .collect(),
                comments: Comments::new(),
            }),
        }
    }
}

/// A JavaScript number as a JSON number: integral values within the safe
/// integer range become integers.
fn number(value: f64) -> Value {
    const SAFE: f64 = 9_007_199_254_740_991.0;
    if value.fract() == 0.0 && value.abs() <= SAFE {
        return Value::Number(Number::from(value as i64));
    }
    Number::from_f64(value).map_or(Value::Null, Value::Number)
}
