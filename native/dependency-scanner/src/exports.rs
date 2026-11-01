//! `CommonJS` `exports` and `module.exports` assignment target detection.
//!
//! Matches static and computed `exports` member expressions against `ast-module-types` rules.

use oxc_ast::ast::{AssignmentTarget, Expression};

// Match ast-module-types' Babel shapes, including computed identifier properties.
// A string property named "exports" intentionally does not match that classifier.
#[inline]
fn peel<'a>(expression: &'a Expression<'a>) -> &'a Expression<'a> {
    expression.without_parentheses().get_inner_expression()
}
#[inline]
fn identifier(expression: &Expression<'_>, name: &str) -> bool {
    matches!(peel(expression), Expression::Identifier(value) if value.name == name)
}
#[inline]
fn module_exports(expression: &Expression<'_>) -> bool {
    match peel(expression) {
        Expression::StaticMemberExpression(member) => {
            !member.optional
                && member.property.name == "exports"
                && identifier(&member.object, "module")
        }
        Expression::ComputedMemberExpression(member) => {
            !member.optional
                && identifier(&member.expression, "exports")
                && identifier(&member.object, "module")
        }
        _ => false,
    }
}
#[inline]
fn attached(object: &Expression<'_>) -> bool {
    identifier(object, "exports") || module_exports(object)
}
#[inline]
pub(crate) fn is_exports(target: &AssignmentTarget<'_>) -> bool {
    match target {
        AssignmentTarget::AssignmentTargetIdentifier(value) => value.name == "exports",
        AssignmentTarget::StaticMemberExpression(member) => {
            !member.optional
                && (attached(&member.object)
                    || (member.property.name == "exports" && identifier(&member.object, "module")))
        }
        AssignmentTarget::ComputedMemberExpression(member) => {
            !member.optional
                && (attached(&member.object)
                    || (identifier(&member.expression, "exports")
                        && identifier(&member.object, "module")))
        }
        AssignmentTarget::PrivateFieldExpression(member) => {
            !member.optional && attached(&member.object)
        }
        _ => target.get_expression().is_some_and(attached),
    }
}
