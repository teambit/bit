//! Shared client transport for file and HTTP Bit scopes.
//! The transport keeps tar and compressed object bodies inside Rust.
//!
//! Coordinates [`remotes`], [`http`], [`tar`], [`config`] ([`GlobalConfig`]), [`fetch`], [`resolver`], and [`Cancellation`].

pub mod cancellation;
pub mod config;
pub mod fetch;
pub mod http;
pub mod remotes;
pub mod resolver;
pub mod tar;

pub use cancellation::Cancellation;

/// Global Bit configuration map preserving key insertion order across [`config`] layers.
pub type GlobalConfig = indexmap::IndexMap<String, serde_json::Value>;

/// Construct an [`std::io::ErrorKind::InvalidData`] error with `message` (or `"invalid transport data"` when blank).
#[inline]
pub(crate) fn invalid(message: &str) -> std::io::Error {
    let trimmed = message.trim();
    let text = if trimmed.is_empty() { "invalid transport data" } else { trimmed };
    std::io::Error::new(std::io::ErrorKind::InvalidData, text)
}

/// Returns `true` when `value` is a 40-character lowercase hexadecimal SHA-1 hash ([`is_lowercase_hex_byte`]).
#[inline]
#[must_use]
pub(crate) fn is_hash(value: &str) -> bool {
    let value = value.trim();
    value.len() == 40 && value.bytes().all(is_lowercase_hex_byte)
}

/// Returns `true` when `byte` is an ASCII digit (`0..=9`) or lowercase hex letter (`a..=f`).
#[inline]
const fn is_lowercase_hex_byte(byte: u8) -> bool {
    matches!(byte, b'0'..=b'9' | b'a'..=b'f')
}
