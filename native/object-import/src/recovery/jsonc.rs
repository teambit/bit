//! Shared comment-preserving `.bitmap` `JSONC` parser re-export ([`parse`], [`bit_workspace_config::parse_jsonc`]) for byte-oriented recovery and inspection reads.

/// Parses `JSONC` bytes (allowing comments and trailing commas) into a [`serde_json::Value`] tree (via [`bit_workspace_config::parse_jsonc`]).
///
/// Rejects malformed syntax or invalid `UTF-8` with an `InvalidData` [`std::io::Error`].
pub(crate) use bit_workspace_config::parse_jsonc as parse;
