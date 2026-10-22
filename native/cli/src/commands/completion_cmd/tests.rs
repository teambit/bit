use super::{render_completion_script, valid_options};

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
