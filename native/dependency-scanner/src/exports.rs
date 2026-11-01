use oxc_ast::ast::{AssignmentTarget, Expression};

// Match ast-module-types' Babel shapes, including computed identifier properties.
// A string property named "exports" intentionally does not match that classifier.
fn peel<'a>(expression: &'a Expression<'a>) -> &'a Expression<'a> {
    expression.without_parentheses().get_inner_expression()
}
fn identifier(expression: &Expression<'_>, name: &str) -> bool {
    matches!(peel(expression), Expression::Identifier(value) if value.name == name)
}
fn is_module_exports_member(
    optional: bool,
    object: &Expression<'_>,
    is_exports_prop: bool,
) -> bool {
    !optional && identifier(object, "module") && is_exports_prop
}
fn module_exports(expression: &Expression<'_>) -> bool {
    match peel(expression) {
        Expression::StaticMemberExpression(member) => is_module_exports_member(
            member.optional,
            &member.object,
            member.property.name == "exports",
        ),
        Expression::ComputedMemberExpression(member) => is_module_exports_member(
            member.optional,
            &member.object,
            identifier(&member.expression, "exports"),
        ),
        _ => false,
    }
}
fn attached(object: &Expression<'_>) -> bool {
    identifier(object, "exports") || module_exports(object)
}
pub(crate) fn is_exports(target: &AssignmentTarget<'_>) -> bool {
    match target {
        AssignmentTarget::AssignmentTargetIdentifier(value) => value.name == "exports",
        AssignmentTarget::StaticMemberExpression(member) => {
            (!member.optional && attached(&member.object))
                || is_module_exports_member(
                    member.optional,
                    &member.object,
                    member.property.name == "exports",
                )
        }
        AssignmentTarget::ComputedMemberExpression(member) => {
            (!member.optional && attached(&member.object))
                || is_module_exports_member(
                    member.optional,
                    &member.object,
                    identifier(&member.expression, "exports"),
                )
        }
        AssignmentTarget::PrivateFieldExpression(member) => {
            !member.optional && attached(&member.object)
        }
        _ => target.get_expression().is_some_and(attached),
    }
}
