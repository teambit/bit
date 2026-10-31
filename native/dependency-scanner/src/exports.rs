use oxc_ast::ast::{AssignmentTarget, Expression};

// Match ast-module-types' Babel shapes, including computed identifier properties.
// A string property named "exports" intentionally does not match that classifier.
fn peel<'a>(mut expression: &'a Expression<'a>) -> &'a Expression<'a> {
    while let Expression::ParenthesizedExpression(paren) = expression {
        expression = &paren.expression;
    }
    expression
}
fn identifier(expression: &Expression<'_>, name: &str) -> bool {
    matches!(peel(expression), Expression::Identifier(value) if value.name == name)
}
fn module_exports(expression: &Expression<'_>) -> bool {
    match peel(expression) {
        Expression::StaticMemberExpression(member) => {
            identifier(&member.object, "module") && member.property.name == "exports"
        }
        Expression::ComputedMemberExpression(member) => {
            identifier(&member.object, "module") && identifier(&member.expression, "exports")
        }
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
            attached(&member.object)
                || (identifier(&member.object, "module") && member.property.name == "exports")
        }
        AssignmentTarget::ComputedMemberExpression(member) => {
            attached(&member.object)
                || (identifier(&member.object, "module")
                    && identifier(&member.expression, "exports"))
        }
        AssignmentTarget::PrivateFieldExpression(member) => attached(&member.object),
        _ => false,
    }
}
