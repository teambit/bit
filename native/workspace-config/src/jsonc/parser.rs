//! comment-json 4.2.5 `parse`: attaches each comment to the symbol the
//! JavaScript parser would, so `stringify` reproduces Bit's output.

use super::{
    lexer::{Kind, Token, invalid, tokenize},
    node::{Comment, Comments, Node, Object},
};
use std::io;

/// The parsed root plus the comments before and after it.
pub(super) struct Parsed {
    pub(super) root: Node,
    pub(super) before_all: Vec<Comment>,
    pub(super) after_all: Vec<Comment>,
}

struct Parser {
    tokens: Vec<Token>,
    index: usize,
    inline: bool,
    /// The comment host stack; the top is the object or array being parsed.
    hosts: Vec<Comments>,
    /// `last_prop`, with the stack of the enclosing ones.
    prop: Option<String>,
    props: Vec<Option<String>>,
    unassigned: Option<Vec<Comment>>,
}

pub(super) fn parse(text: &str) -> io::Result<Parsed> {
    let tokens = tokenize(text)?;
    if tokens.is_empty() {
        return Err(invalid("Unexpected end of JSON input"));
    }
    let mut parser = Parser {
        tokens,
        index: 0,
        inline: false,
        hosts: vec![Comments::new()],
        prop: None,
        props: Vec::new(),
        unassigned: None,
    };
    parser.comments(Some("before-all"));
    let root = parser.walk()?;
    parser.comments(Some("after-all"));
    if parser.current().is_some() {
        return Err(parser.unexpected());
    }
    let mut host = parser.hosts.pop().unwrap_or_default();
    Ok(Parsed {
        root,
        before_all: host.remove("before-all").unwrap_or_default(),
        after_all: host.remove("after-all").unwrap_or_default(),
    })
}

impl Parser {
    fn current(&self) -> Option<&Token> {
        self.tokens.get(self.index)
    }

    fn next(&mut self) {
        let previous = self.tokens.get(self.index).map(|token| token.end_line);
        self.index += 1;
        let start = self.current().map(|token| token.start_line);
        self.inline = previous.is_some() && previous == start;
    }

    fn unexpected(&self) -> io::Error {
        match self.current().map(|token| &token.kind) {
            None => invalid("Unexpected end of JSON input"),
            Some(Kind::Punct(punct)) => invalid(format!("Unexpected token {punct}")),
            Some(kind) => invalid(format!("Unexpected token {kind:?}")),
        }
    }

    fn is_punct(&self, expected: char) -> io::Result<bool> {
        match self.current() {
            None => Err(self.unexpected()),
            Some(token) => Ok(token.kind == Kind::Punct(expected)),
        }
    }

    fn expect(&self, expected: char) -> io::Result<()> {
        if self.is_punct(expected)? { Ok(()) } else { Err(self.unexpected()) }
    }

    fn symbol(&self, prefix: &str) -> String {
        match &self.prop {
            Some(prop) => format!("{prefix}:{prop}"),
            None => prefix.to_owned(),
        }
    }

    fn define(&mut self, key: String, comments: Vec<Comment>) {
        if let Some(host) = self.hosts.last_mut() {
            host.insert(key, comments);
        }
    }

    /// `parse_comments`: with a prefix the comments are defined right away,
    /// otherwise they wait in `unassigned` for the next assignment.
    fn comments(&mut self, prefix: Option<&str>) {
        let mut comments = Vec::new();
        while let Some(token) = self.current() {
            let (block, value) = match &token.kind {
                Kind::Line(value) => (false, value.clone()),
                Kind::Block(value) => (true, value.clone()),
                _ => break,
            };
            comments.push(Comment { block, value, inline: self.inline });
            self.next();
        }
        if comments.is_empty() {
            return;
        }
        match prefix {
            Some(prefix) => self.define(self.symbol(prefix), comments),
            None => self.unassigned = Some(comments),
        }
    }

    fn assign(&mut self, prefix: &str) {
        if let Some(comments) = self.unassigned.take() {
            self.define(self.symbol(prefix), comments);
        }
    }

    /// Leading inline comments after a comma belong to the previous property.
    fn assign_after(&mut self) {
        let Some(unassigned) = self.unassigned.as_mut() else { return };
        let count = unassigned
            .iter()
            .take_while(|comment| comment.inline)
            .count();
        if count == 0 {
            return;
        }
        let after: Vec<Comment> = unassigned.drain(..count).collect();
        if unassigned.is_empty() {
            self.unassigned = None;
        }
        self.define(self.symbol("after"), after);
    }

    fn enter(&mut self) {
        self.hosts.push(Comments::new());
        self.props.push(self.prop.take());
    }

    fn leave(&mut self, started: bool) -> Comments {
        if started {
            self.assign("after");
        }
        self.next();
        self.prop = None;
        if !started {
            self.assign("before");
        }
        self.prop = self.props.pop().flatten();
        self.hosts.pop().unwrap_or_default()
    }

    /// Between two members: `after-value` of the previous one, the comma,
    /// then inline `after` comments. `true` when a trailing comma closes.
    fn separator(&mut self, close: char) -> io::Result<bool> {
        self.assign("after-value");
        self.expect(',')?;
        self.next();
        self.comments(None);
        self.assign_after();
        self.is_punct(close)
    }

    fn object(&mut self) -> io::Result<Node> {
        self.enter();
        let mut object = Object::default();
        let mut started = false;
        self.comments(None);
        while !self.is_punct('}')? {
            if started && self.separator('}')? {
                break;
            }
            started = true;
            let Some(Token { kind: Kind::String(name), .. }) = self.current().cloned() else {
                return Err(self.unexpected());
            };
            self.prop = Some(name.clone());
            self.assign("before");
            self.next();
            self.comments(Some("after-prop"));
            self.expect(':')?;
            self.next();
            self.comments(Some("after-colon"));
            object.entries.insert(name, self.walk()?);
            self.comments(None);
        }
        object.comments = self.leave(started);
        Ok(Node::Object(object))
    }

    fn array(&mut self) -> io::Result<Node> {
        self.enter();
        let mut items = Vec::new();
        let mut started = false;
        self.comments(None);
        while !self.is_punct(']')? {
            if started && self.separator(']')? {
                break;
            }
            started = true;
            self.prop = Some(items.len().to_string());
            self.assign("before");
            items.push(self.walk()?);
            self.comments(None);
        }
        let comments = self.leave(started);
        Ok(Node::Array(items, comments))
    }

    fn walk(&mut self) -> io::Result<Node> {
        let kind = self
            .current()
            .map(|token| token.kind.clone())
            .ok_or_else(|| self.unexpected())?;
        match kind {
            Kind::Punct('{') => {
                self.next();
                self.object()
            }
            Kind::Punct('[') => {
                self.next();
                self.array()
            }
            Kind::Punct('-') => {
                self.next();
                match self.current().map(|token| token.kind.clone()) {
                    Some(Kind::Number(value)) => {
                        self.next();
                        Ok(Node::Number(-value))
                    }
                    _ => Err(self.unexpected()),
                }
            }
            kind => self.literal(kind),
        }
    }

    fn literal(&mut self, kind: Kind) -> io::Result<Node> {
        let node = match kind {
            Kind::String(value) => Node::String(value),
            Kind::Number(value) => Node::Number(value),
            Kind::Bool(value) => Node::Bool(value),
            Kind::Null => Node::Null,
            _ => return Err(self.unexpected()),
        };
        self.next();
        Ok(node)
    }
}
