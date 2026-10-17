use super::{list, table};
use crate::commands::color::Chalk;
#[test]
fn table_uses_published_double_outline_and_row_separators() {
    assert_eq!(
        table(&[vec!["a".into()], vec!["xyz".into()]]),
        "╔═════╗\n║ a   ║\n╟─────╢\n║ xyz ║\n╚═════╝\n",
    );
}
#[test]
fn colors_do_not_increase_column_width() {
    let plain = list(Chalk::new(false));
    assert_eq!(super::strip(&list(Chalk::new(true))), plain);
    assert_eq!(plain.matches("╟").count(), 8);
}

#[test]
fn debug_log_stripping_preserves_incomplete_and_multiline_escape_sequences() {
    assert_eq!(super::strip("a\u{1b}[31mb\u{1b}[0mc"), "abc");
    assert_eq!(super::strip("a\u{1b}[oops\nkeepm"), "a\u{1b}[oops\nkeepm");
    assert_eq!(super::strip("a\u{1b}oops"), "a\u{1b}oops");
}
