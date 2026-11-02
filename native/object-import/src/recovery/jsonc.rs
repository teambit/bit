//! Shared comment-preserving `JSONC` parser re-export ([`parse`]) for byte-oriented recovery reads.

/// Parses `JSONC` bytes (allowing comments and trailing commas) into a [`serde_json::Value`] tree.
pub(crate) use bit_workspace_config::parse_jsonc as parse;
