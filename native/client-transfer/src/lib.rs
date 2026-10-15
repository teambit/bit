//! Shared client transport for file and HTTP Bit scopes.
//! The transport keeps tar and compressed object bodies inside Rust.

pub mod fetch;
pub mod http;
pub mod remotes;
pub mod resolver;
pub mod tar;

pub type GlobalConfig = indexmap::IndexMap<String, serde_json::Value>;

pub(crate) fn invalid(message: &str) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::InvalidData, message)
}

pub(crate) fn is_hash(value: &str) -> bool {
    value.len() == 40
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}
