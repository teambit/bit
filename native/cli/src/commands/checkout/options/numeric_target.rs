//! yargs-parser's positional number coercion followed by `CheckoutCmd`'s `String(to)`.
use std::sync::OnceLock;

pub(super) fn normalize(raw: &str) -> String {
    number(raw)
        .and_then(|number| {
            serde_json::Number::from_f64(number)
                .and_then(|number| {
                    bit_object_import::stringify_json(&serde_json::Value::Number(number), false)
                        .ok()
                })
        })
        .unwrap_or_else(|| raw.into())
}
fn number(raw: &str) -> Option<f64> {
    if let Some(hex) = raw
        .strip_prefix("0x")
        .or_else(|| raw.strip_prefix("0X"))
    {
        // parseFloat("0x...") is zero, so yargs' safe-integer gate always accepts hex.
        if hex.is_empty() || !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return None;
        }
        return u128::from_str_radix(hex, 16)
            .ok()
            .map(|number| number as f64);
    }
    if raw.starts_with('0')
        && raw
            .as_bytes()
            .get(1)
            .is_some_and(|byte| *byte != b'.')
    {
        return None;
    }
    static DECIMAL: OnceLock<regress::Regex> = OnceLock::new();
    let grammar = DECIMAL.get_or_init(|| {
        regress::Regex::new(r"^[-]?(?:\d+(?:\.\d*)?|\.\d+)(e[-+]?\d+)?$")
            .expect("published yargs number grammar")
    });
    grammar.find(raw)?;
    let number = raw.parse::<f64>().ok()?;
    let integer = number.floor();
    (integer.is_finite() && integer.abs() <= 9_007_199_254_740_991.0).then_some(number)
}

#[cfg(test)]
mod tests;
