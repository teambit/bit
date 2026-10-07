use oxc_ast::{
    AstKind,
    ast::{Argument, Expression, Program},
};
use oxc_ast_visit::Visit;

#[derive(Default, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Classification {
    #[default]
    None,
    Supported,
    Fallback,
}
#[derive(Default)]
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
            AstKind::CallExpression(call) => classify_call(&call.callee, &call.arguments),
            // Assignment-based exports need exact legacy AST matching before native dispatch.
            AstKind::AssignmentExpression(_) => Classification::Fallback,
            _ => Classification::None,
        };
    }
}
fn classify_call(callee: &Expression<'_>, arguments: &[Argument<'_>]) -> Classification {
    match callee {
        Expression::Identifier(identifier) if identifier.name == "define" => {
            Classification::Fallback
        }
        Expression::Identifier(identifier) if identifier.name == "require" => {
            if matches!(arguments.first(), Some(Argument::ArrayExpression(_))) {
                Classification::Fallback
            } else {
                Classification::Supported
            }
        }
        Expression::StaticMemberExpression(member) if member.property.name == "require" => {
            Classification::Fallback
        }
        _ => Classification::None,
    }
}
pub(crate) fn classify(program: &Program<'_>) -> Classification {
    let mut classifier = Classifier::default();
    classifier.visit_program(program);
    classifier.classification
}

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
