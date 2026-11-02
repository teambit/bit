//! Module format [`Classification`] (`Supported`, `Fallback`, or `None`) for `JavaScript` ASTs.
//!
//! [`Classifier`] reproduces `ast-module-types` and `module-definition` heuristics on top of Oxc [`AstKind`] nodes.

use oxc_ast::{
    AstKind,
    ast::{Argument, Expression, Program},
};
use oxc_ast_visit::Visit;

/// Module format classification (`None`, `Supported`, or `Fallback`) for an AST program.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Classification {
    #[default]
    None,
    Supported,
    Fallback,
}
/// AST visitor that classifies a `JavaScript` program into [`Classification`].
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
struct Classifier {
    classification: Classification,
}
impl<'ast> Visit<'ast> for Classifier {
    fn enter_node(&mut self, node: AstKind<'ast>) {
        if self.classification != Classification::None {
            return;
        }
        self.classification = match node {
            AstKind::ImportDeclaration(_)
            | AstKind::ExportDeclaration(_)
            | AstKind::ExportNamedDeclaration(_)
            | AstKind::ExportFromDeclaration(_)
            | AstKind::ExportDefaultDeclaration(_)
            | AstKind::ExportAllDeclaration(_)
            // Babel's `Import` callee makes module-definition classify dynamic imports as ES6.
            | AstKind::ImportExpression(_) => Classification::Supported,
            AstKind::CallExpression(call) => {
                let class = classify_call(&call.callee, &call.arguments);
                if class != Classification::None && crate::calls::in_optional_chain(call) {
                    Classification::None
                } else {
                    class
                }
            }
            AstKind::AssignmentExpression(assignment) => {
                if crate::exports::is_exports(&assignment.left) {
                    Classification::Supported
                } else {
                    Classification::None
                }
            }
            _ => Classification::None,
        };
    }
}
/// Classifies a `CallExpression` (`require`, AMD `require([...])`, `define`, or `*.require`) into [`Classification`].
#[inline]
fn classify_call(callee: &Expression<'_>, arguments: &[Argument<'_>]) -> Classification {
    match callee.without_parentheses() {
        Expression::Identifier(identifier) if identifier.name == "require" => {
            let is_amd_array = arguments
                .first()
                .and_then(Argument::as_expression)
                .is_some_and(|expr| {
                    matches!(expr.without_parentheses(), Expression::ArrayExpression(_))
                });
            if is_amd_array { Classification::Fallback } else { Classification::Supported }
        }
        Expression::Identifier(identifier) if identifier.name == "define" => {
            Classification::Fallback
        }
        Expression::StaticMemberExpression(member) if member.property.name == "require" => {
            Classification::Fallback
        }
        Expression::ComputedMemberExpression(member)
            if matches!(
                member.expression.without_parentheses(),
                Expression::Identifier(id) if id.name == "require",
            ) =>
        {
            Classification::Fallback
        }
        _ => Classification::None,
    }
}
#[inline]
pub(crate) fn classify(program: &Program<'_>) -> Classification {
    let mut classifier = Classifier::default();
    classifier.visit_program(program);
    classifier.classification
}

#[inline]
pub(crate) fn classification_outcome(
    file: &crate::File,
    program: &Program<'_>,
) -> Option<crate::Outcome> {
    match classify(program) {
        Classification::None => Some(crate::Outcome {
            path: file.path.clone(),
            status: "ok",
            dependencies: indexmap::IndexMap::new(),
            diagnostics: vec![],
        }),
        Classification::Fallback => Some(crate::outcome(
            file,
            "unsupported",
            "module classification requires legacy fallback".into(),
        )),
        Classification::Supported => None,
    }
}

#[inline]
pub(crate) fn legacy_object_key(name: &str) -> bool {
    matches!(
        name.trim(),
        "constructor"
            | "__defineGetter__"
            | "__defineSetter__"
            | "hasOwnProperty"
            | "__lookupGetter__"
            | "__lookupSetter__"
            | "isPrototypeOf"
            | "propertyIsEnumerable"
            | "toString"
            | "valueOf"
            | "__proto__"
            | "toLocaleString",
    )
}
