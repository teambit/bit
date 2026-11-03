//! Unit tests for `bit completion` [`valid_options`] validation and [`render_completion_script`] rendering.
//!
//! Verifies `bash` and `zsh` completion script markers in [`render_completion_script`] and `--no-color` boolean flag handling across [`valid_options`].

use super::{render_completion_script, valid_options};

/// Verifies `bit completion` [`valid_options`] option validation and [`render_completion_script`] `bash` / `zsh` script rendering.
/// Checks both shell header markers and completion registration commands.
#[test]
fn validates_completion_options_and_renders_scripts() {
    assert!(valid_options(&[]));
    assert!(valid_options(&["--no-color"]));
    assert!(!valid_options(&["--unknown"]));

    let bash = render_completion_script(false);
    assert!(bash.starts_with("###-begin-bit-completions-###\n"));
    assert!(bash.contains("complete -o default -F _bit_yargs_completions bit"));
    assert!(bash.ends_with("###-end-bit-completions-###\n"));

    let zsh = render_completion_script(true);
    assert!(zsh.starts_with("#compdef bit\n###-begin-bit-completions-###\n"));
    assert!(zsh.contains("compdef _bit_yargs_completions bit"));
    assert!(zsh.ends_with("###-end-bit-completions-###\n"));
}

/// Verifies [`valid_options`] accepts explicit `--no-color=true` and `--no-color=false` flags and rejects positionals.
///
/// Ensures positional arguments decline native `bit completion` handling before script emission.
#[test]
fn valid_options_accepts_explicit_no_color_boolean_values() {
    assert!(valid_options(&["--no-color=true"]));
    assert!(valid_options(&["--no-color=false"]));
    assert!(!valid_options(&["positional"]));
}
