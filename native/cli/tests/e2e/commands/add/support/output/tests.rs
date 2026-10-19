use super::assert_errors;

fn variants() -> [String; 2] {
    let body = "fatal: zlib.inflate has failed with an error: \"incorrect header check\"\ntry running bit import --all-history to fix the corrupted objects";
    [body.into(), format!("remote actual.remote responded with the following error:\n{body}")]
}

#[test]
fn only_the_two_complete_independent_stream_errors_are_accepted() {
    let variants = variants();
    for actual in &variants {
        for expected in &variants {
            assert_errors(actual, expected, &variants);
        }
    }
}

#[test]
fn changed_scope_cause_advice_and_extra_output_are_rejected() {
    let variants = variants();
    let wrong = [
        variants[1].replace("actual.remote", "another.remote"),
        variants[0].replace("incorrect header check", "permission denied"),
        variants[0].replace("import --all-history", "reset --hard"),
        format!("extra\n{}", variants[0]),
        format!("{}\nextra", variants[1]),
        String::new(),
    ];
    for error in &wrong {
        assert!(
            std::panic::catch_unwind(|| assert_errors(error, &variants[0], &variants)).is_err(),
        );
        assert!(
            std::panic::catch_unwind(|| assert_errors(&variants[1], error, &variants)).is_err(),
        );
    }
}
