use oxc_ast::ast::{Argument, CallExpression, Expression};
/// Babel types every call after the first `?.` of a chain as `OptionalCallExpression`, which
/// neither the JS detective nor module-definition matches; `typescript-estree` keeps
/// `CallExpression`.
pub(crate) fn in_optional_chain(node: &CallExpression<'_>) -> bool {
    if node.optional {
        return true;
    }
    let mut current = &node.callee;
    loop {
        current = match current {
            Expression::StaticMemberExpression(m) if !m.optional => &m.object,
            Expression::ComputedMemberExpression(m) if !m.optional => &m.object,
            Expression::PrivateFieldExpression(m) if !m.optional => &m.object,
            Expression::CallExpression(c) if !c.optional => &c.callee,
            Expression::StaticMemberExpression(_)
            | Expression::ComputedMemberExpression(_)
            | Expression::PrivateFieldExpression(_)
            | Expression::CallExpression(_) => return true,
            _ => return false,
        };
    }
}
/// Literals whose legacy `value` becomes a coerced dependency key (`import(5)` yields `"5"`).
pub(crate) fn nonstring_literal(argument: Option<&Argument<'_>>) -> bool {
    matches!(
        argument,
        Some(
            Argument::NumericLiteral(_)
                | Argument::BooleanLiteral(_)
                | Argument::BigIntLiteral(_)
                | Argument::RegExpLiteral(_)
        ),
    )
}
pub(crate) fn accepted(node: &CallExpression<'_>, ts: bool) -> bool {
    (ts || !in_optional_chain(node))
        && match &node.callee {
            Expression::Identifier(id) => id.name == "require",
            Expression::StaticMemberExpression(m) => {
                m.property.name == "resolve"
                    && match &m.object {
                        Expression::Identifier(id) => id.name == "require",
                        Expression::ImportMeta(_) => true,
                        _ => false,
                    }
            }
            Expression::ComputedMemberExpression(m) => {
                matches!(&m.expression,Expression::Identifier(id) if id.name=="resolve")
                    && (matches!(&m.object,Expression::Identifier(id) if id.name=="require")
                        || matches!(&m.object, Expression::ImportMeta(_)))
            }
            _ => false,
        }
}
