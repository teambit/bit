//! `CommonJS` `exports` and `module.exports` assignment target detection.
//!
//! [`module_exports`] matches static and computed `exports` [`Expression`] nodes against `ast-module-types` rules.

use oxc_ast::ast::{AssignmentTarget, Expression};

// Match ast-module-types' Babel shapes, including computed identifier properties.
// A string property named "exports" intentionally does not match that classifier.
/// Strip outer parenthesized expressions from [`Expression`] `expression`.
#[inline]
fn peel<'a>(expression: &'a Expression<'a>) -> &'a Expression<'a> {
    expression.without_parentheses().get_inner_expression()
}
/// Return `true` when [`Expression`] `expression` is a non-parenthesized identifier matching `name`.
#[inline]
fn identifier(expression: &Expression<'_>, name: &str) -> bool {
    matches!(peel(expression), Expression::Identifier(value) if value.name == name)
}
/// Returns `true` when `expression` ([`Expression`]) is a static or computed `module.exports` member expression ([`peel`], [`identifier`]).
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
/// Returns `true` when `object` is `exports` or `module.exports`.
#[inline]
fn attached(object: &Expression<'_>) -> bool {
    identifier(object, "exports") || module_exports(object)
}
/// Returns `true` when [`AssignmentTarget`] `target` assigns to `exports`, `module.exports`, or a property thereof.
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
