use super::{EngineError, READ_PACKAGE_HOOKS_CHECKSUM, VIRTUAL_STORE_DIR_MAX_LENGTH};
use pretty_assertions::assert_eq;

#[test]
fn engine_errors_render_like_bit_renders_pnpm_errors() {
    let error = EngineError {
        code: Some("ERR_PNPM_NO_MATCHING_VERSION".to_string()),
        message: "No matching version found for a@9".to_string(),
        hint: Some("The latest release of a is 1.0.0".to_string()),
    };
    let io = error.clone().into_io();
    assert_eq!(
        io.to_string(),
        "No matching version found for a@9\n\nThe latest release of a is 1.0.0",
    );
    assert_eq!(EngineError::from_io(&io), Some(&error));
}

#[test]
fn constants_match_bit() {
    assert_eq!(READ_PACKAGE_HOOKS_CHECKSUM, "bit-1");
    assert_eq!(VIRTUAL_STORE_DIR_MAX_LENGTH, if cfg!(windows) { 60 } else { 120 });
}
