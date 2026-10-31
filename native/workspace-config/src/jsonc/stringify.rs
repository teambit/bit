//! comment-json 4.2.5 `stringify(value, undefined, 2)`.

use super::node::{Comment, Comments, Node, Object};

const INDENT: &str = "  ";

/// Whitespace as JavaScript's `String.prototype.trim` sees it.
fn is_js_whitespace(character: char) -> bool {
    (character.is_whitespace() && character != '\u{0085}') || character == '\u{feff}'
}

fn trim_end(value: &str) -> &str {
    value.trim_end_matches(is_js_whitespace)
}

/// `process_comments`: each comment on its own line unless inline; a block of
/// comments ending with a line comment (or `display_block`) ends with a newline.
fn process(comments: Option<&[Comment]>, deeper_gap: &str, display_block: bool) -> String {
    let Some(comments) = comments.filter(|comments| !comments.is_empty()) else {
        return String::new();
    };
    let mut output = String::new();
    let mut line = false;
    for comment in comments {
        if comment.inline {
            output.push(' ');
        } else {
            output.push('\n');
            output.push_str(deeper_gap);
        }
        line = !comment.block;
        let (open, close) = if comment.block { ("/*", "*/") } else { ("//", "") };
        output.push_str(open);
        output.push_str(&comment.value);
        output.push_str(close);
    }
    if display_block || line {
        output.push('\n');
        output.push_str(deeper_gap);
    }
    output
}

fn join(one: &str, two: &str, gap: &str) -> String {
    match (one.is_empty(), two.is_empty()) {
        (false, false) => format!("{one}{}\n{gap}", two.trim_matches(is_js_whitespace)),
        (false, true) => format!("{}\n{gap}", trim_end(one)),
        (true, false) => format!("{}\n{gap}", trim_end(two)),
        (true, true) => String::new(),
    }
}

fn join_content(inside: &str, comments: &Comments, gap: &str) -> String {
    let deeper_gap = format!("{gap}{INDENT}");
    let comment = process(comments.get("before").map(Vec::as_slice), &deeper_gap, true);
    join(&comment, inside, gap)
}

/// Escapes like comment-json: only the characters with a short escape are
/// replaced; the rest of its "escapable" set is written as is.
fn quote(value: &str) -> String {
    let mut output = String::with_capacity(value.len() + 2);
    output.push('"');
    for char in value.chars() {
        match char {
            '\u{8}' => output.push_str(r"\b"),
            '\t' => output.push_str(r"\t"),
            '\n' => output.push_str(r"\n"),
            '\u{c}' => output.push_str(r"\f"),
            '\r' => output.push_str(r"\r"),
            '"' => output.push_str(r#"\""#),
            '\\' => output.push_str(r"\\"),
            _ => output.push(char),
        }
    }
    output.push('"');
    output
}

fn number(value: f64) -> String {
    if value.is_finite() {
        let normalized = if value == 0.0 { 0.0 } else { value };
        ryu_js::Buffer::new().format_finite(normalized).to_owned()
    } else {
        "null".to_owned()
    }
}

pub(super) fn node(value: &Node, gap: &str) -> String {
    match value {
        Node::Null => "null".to_owned(),
        Node::Bool(value) => value.to_string(),
        Node::Number(value) => number(*value),
        Node::String(value) => quote(value),
        Node::Array(items, comments) => array(items, comments, gap),
        Node::Object(object) => self::object(object, gap),
    }
}

/// The `inside` of an object or array, closed by its trailing comments.
struct Members<'a> {
    comments: &'a Comments,
    deeper_gap: String,
    inside: String,
    after_comma: String,
}

impl Members<'_> {
    fn comments(&self, prefix: &str, key: &str) -> String {
        process(
            self.comments
                .get(&format!("{prefix}:{key}"))
                .map(Vec::as_slice),
            &self.deeper_gap,
            false,
        )
    }

    fn open(&mut self, first: bool, key: &str) {
        if !first {
            self.inside.push(',');
        }
        let before = join(&self.after_comma, &self.comments("before", key), &self.deeper_gap);
        if before.is_empty() {
            self.inside.push('\n');
            self.inside.push_str(&self.deeper_gap);
        } else {
            self.inside.push_str(&before);
        }
    }

    fn close(mut self, gap: &str) -> String {
        let after = process(self.comments.get("after").map(Vec::as_slice), &self.deeper_gap, false);
        self.inside.push_str(&join(&self.after_comma, &after, &self.deeper_gap));
        join_content(&self.inside, self.comments, gap)
    }
}

fn array(items: &[Node], comments: &Comments, gap: &str) -> String {
    let deeper_gap = format!("{gap}{INDENT}");
    let mut members =
        Members { comments, deeper_gap, inside: String::new(), after_comma: String::new() };
    for (index, item) in items.iter().enumerate() {
        let key = index.to_string();
        members.open(index == 0, &key);
        members.inside.push_str(&node(item, &members.deeper_gap));
        members.inside.push_str(&members.comments("after-value", &key));
        members.after_comma = members.comments("after", &key);
    }
    format!("[{}]", members.close(gap))
}

fn object(object: &Object, gap: &str) -> String {
    let deeper_gap = format!("{gap}{INDENT}");
    let mut members = Members {
        comments: &object.comments,
        deeper_gap,
        inside: String::new(),
        after_comma: String::new(),
    };
    for (index, key) in object
        .ordered_keys()
        .into_iter()
        .enumerate()
    {
        let Some(entry_node) = object.entries.get(key) else {
            continue;
        };
        members.open(index == 0, key);
        let value = node(entry_node, &members.deeper_gap);
        let entry = format!(
            "{}{}:{} {value}{}",
            quote(key),
            members.comments("after-prop", key),
            members.comments("after-colon", key),
            members.comments("after-value", key),
        );
        members.inside.push_str(&entry);
        members.after_comma = members.comments("after", key);
    }
    format!("{{{}}}", members.close(gap))
}

/// The document: `before-all` comments (left-trimmed), the root, then
/// `after-all` comments (right-trimmed).
pub(super) fn document(root: &Node, before_all: &[Comment], after_all: &[Comment]) -> String {
    let body = node(root, "");
    if !matches!(root, Node::Array(..) | Node::Object(_)) {
        return body;
    }
    let before = process(Some(before_all), "", false);
    let after = process(Some(after_all), "", false);
    format!("{}{body}{}", before.trim_start_matches(is_js_whitespace), trim_end(&after))
}
