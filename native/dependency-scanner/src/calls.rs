//! Call-expression classification for `require`, `require.resolve`, and optional chains.

use oxc_ast::ast::{Argument, CallExpression, Expression};
/// Babel types every call after the first `?.` of a chain as `OptionalCallExpression`, which
/// neither the JS detective nor module-definition matches; `typescript-estree` keeps
/// `CallExpression`.
#[inline]
pub(crate) fn in_optional_chain(node: &CallExpression<'_>) -> bool {
    if node.optional {
        return true;
    }
    let mut current = &node.callee;
    loop {
        current = match current {
            Expression::ParenthesizedExpression(paren) => &paren.expression,
            Expression::StaticMemberExpression(member) if !member.optional => &member.object,
            Expression::ComputedMemberExpression(member) if !member.optional => &member.object,
            Expression::PrivateFieldExpression(member) if !member.optional => &member.object,
            Expression::CallExpression(call) if !call.optional => &call.callee,
            Expression::ChainExpression(_)
            | Expression::StaticMemberExpression(_)
            | Expression::ComputedMemberExpression(_)
            | Expression::PrivateFieldExpression(_)
            | Expression::CallExpression(_) => return true,
            _ => return false,
        };
    }
}
/// Literals whose legacy `value` becomes a coerced dependency key (`import(5)` yields `"5"`).
#[inline]
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
#[inline]
pub(crate) fn accepted(node: &CallExpression<'_>, ts: bool) -> bool {
    let callee = node.callee.without_parentheses();
    let matched = match callee {
        Expression::Identifier(id) => id.name == "require",
        Expression::StaticMemberExpression(member) => {
            member.property.name == "resolve" && is_resolve_receiver(&member.object)
        }
        Expression::ComputedMemberExpression(member) => {
            matches!(
                member.expression.without_parentheses(),
                Expression::Identifier(id) if id.name == "resolve",
            ) && is_resolve_receiver(&member.object)
        }
        _ => false,
    };
    matched && (ts || !in_optional_chain(node))
}

#[inline]
fn is_resolve_receiver(object: &Expression<'_>) -> bool {
    match object.without_parentheses() {
        Expression::Identifier(id) => id.name == "require",
        Expression::ImportMeta(_) => true,
        _ => false,
    }
}
