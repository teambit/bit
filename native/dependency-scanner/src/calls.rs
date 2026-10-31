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
            Expression::ParenthesizedExpression(paren) => &paren.expression,
            Expression::StaticMemberExpression(member) if !member.optional => &member.object,
            Expression::ComputedMemberExpression(member) if !member.optional => &member.object,
            Expression::PrivateFieldExpression(member) if !member.optional => &member.object,
            Expression::CallExpression(call) if !call.optional => &call.callee,
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
    let mut callee = &node.callee;
    while let Expression::ParenthesizedExpression(paren) = callee {
        callee = &paren.expression;
    }
    (ts || !in_optional_chain(node))
        && match callee {
            Expression::Identifier(id) => id.name == "require",
            Expression::StaticMemberExpression(member) => {
                member.property.name == "resolve"
                    && match member.object.without_parentheses() {
                        Expression::Identifier(id) => id.name == "require",
                        Expression::ImportMeta(_) => true,
                        _ => false,
                    }
            }
            Expression::ComputedMemberExpression(member) => {
                matches!(
                    member.expression.without_parentheses(),
                    Expression::Identifier(id) if id.name == "resolve",
                ) && matches!(
                    member.object.without_parentheses(),
                    Expression::Identifier(id) if id.name == "require",
                ) || (matches!(
                    member.expression.without_parentheses(),
                    Expression::Identifier(id) if id.name == "resolve",
                ) && matches!(member.object.without_parentheses(), Expression::ImportMeta(_)))
            }
            _ => false,
        }
}
