//! Sufficient AST proof for the pinned React/JSDoc parser's empty result.
#[cfg(test)]
mod tests;
mod unexported;

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    Argument, ArrowFunctionBody, ArrowFunctionExpression, AssignmentTarget, BindingPattern,
    CallExpression, Expression, SpreadElement, Statement, VariableDeclarator,
};
use oxc_ast_visit::{Visit, walk};
use oxc_parser::{ParseOptions, Parser};
use oxc_span::SourceType;

/// Prove that a bounded, valid source or Jest snapshot has no React or `JSDoc` docs.
///
/// This is deliberately sufficient rather than exhaustive: only simple data,
/// variable declarations, static property access/assignment and literal `require`
/// calls, `console.log` calls with data arguments and zero-argument arrows
/// returning a string, number or boolean qualify.
/// Valid sources without exports also qualify, including test callbacks.
/// Other exported functions, classes, JSX, module declarations, other calls and
/// unsupported constructs defer to the published parser. Raw `/**` is rejected
/// even inside strings because the pinned `JSDoc` extractor scans source text.
/// This says nothing about existing cached documentation, which must take
/// precedence unchanged, or whether filesystem caching is enabled.
#[must_use]
pub fn proves_empty_docs(source: &[u8], relative_path: &str) -> bool {
    if source.len() > crate::limits::SOURCE_BYTES {
        return false;
    }
    let Some(source_type) = source_type(relative_path) else { return false };
    let Ok(source) = std::str::from_utf8(source) else { return false };
    if source.contains("/**") {
        return false;
    }
    let allocator = Allocator::default();
    let options = ParseOptions { preserve_parens: false, ..ParseOptions::default() };
    let parsed = Parser::new(&allocator, source, source_type).with_options(options).parse();
    if parsed.fatal_error || !parsed.diagnostics.is_empty() {
        return false;
    }
    let mut proof = Proof { accepted: true, depth: 0, expressions: 0 };
    proof.visit_program(&parsed.program);
    proof.accepted || unexported::proven(&parsed.program)
}

fn source_type(path: &str) -> Option<SourceType> {
    if path.ends_with(".js.snap") {
        return Some(SourceType::cjs());
    }
    let kind = path.rsplit('.').next()?;
    matches!(kind, "js" | "cjs" | "mjs" | "jsx" | "ts" | "tsx" | "mts" | "cts")
        .then(|| SourceType::from_path(path).ok())
        .flatten()
}

struct Proof {
    accepted: bool,
    depth: usize,
    expressions: usize,
}
impl<'a> Visit<'a> for Proof {
    fn visit_statement(&mut self, statement: &Statement<'a>) {
        if !matches!(
            statement,
            Statement::EmptyStatement(_)
                | Statement::ExpressionStatement(_)
                | Statement::VariableDeclaration(_),
        ) {
            self.accepted = false;
            return;
        }
        walk::walk_statement(self, statement);
    }
    fn visit_expression(&mut self, expression: &Expression<'a>) {
        self.expressions += 1;
        if !self.accepted
            || self.depth >= 128
            || self.expressions > 16384
            || !data_expression(expression)
        {
            self.accepted = false;
            return;
        }
        self.depth += 1;
        walk::walk_expression(self, expression);
        self.depth -= 1;
    }
    fn visit_variable_declarator(&mut self, declaration: &VariableDeclarator<'a>) {
        if !matches!(declaration.id, BindingPattern::BindingIdentifier(_)) {
            self.accepted = false;
            return;
        }
        walk::walk_variable_declarator(self, declaration);
    }
    fn visit_assignment_target(&mut self, target: &AssignmentTarget<'a>) {
        if !data_target(target) {
            self.accepted = false;
            return;
        }
        walk::walk_assignment_target(self, target);
    }
    fn visit_arrow_function_expression(&mut self, arrow: &ArrowFunctionExpression<'a>) {
        self.accepted &= literal_arrow(arrow);
    }
    fn visit_spread_element(&mut self, _: &SpreadElement<'a>) {
        self.accepted = false;
    }
}
fn data_expression(expression: &Expression<'_>) -> bool {
    match expression {
        Expression::BooleanLiteral(_)
        | Expression::NullLiteral(_)
        | Expression::NumericLiteral(_)
        | Expression::StringLiteral(_)
        | Expression::Identifier(_)
        | Expression::ObjectExpression(_)
        | Expression::ArrayExpression(_)
        | Expression::BinaryExpression(_)
        | Expression::AssignmentExpression(_) => true,
        Expression::StaticMemberExpression(member) => !member.optional,
        Expression::CallExpression(call) => literal_require(call) || console_log(call),
        Expression::ArrowFunctionExpression(arrow) => literal_arrow(arrow),
        Expression::TemplateLiteral(template) => template.expressions.is_empty(),
        _ => false,
    }
}

fn data_target(target: &AssignmentTarget<'_>) -> bool {
    match target {
        AssignmentTarget::AssignmentTargetIdentifier(_)
        | AssignmentTarget::StaticMemberExpression(_) => true,
        AssignmentTarget::ComputedMemberExpression(member) => {
            matches!(&member.object, Expression::Identifier(id) if id.name == "exports")
                && (matches!(&member.expression, Expression::StringLiteral(_))
                    || matches!(&member.expression, Expression::TemplateLiteral(value) if value.expressions.is_empty()))
        }
        _ => false,
    }
}
fn literal_require(call: &CallExpression<'_>) -> bool {
    !call.optional
        && matches!(&call.callee, Expression::Identifier(id) if id.name == "require")
        && matches!(call.arguments.as_slice(), [Argument::StringLiteral(_)])
}

fn console_log(call: &CallExpression<'_>) -> bool {
    !call.optional
        && matches!(&call.callee, Expression::StaticMemberExpression(member)
            if !member.optional && member.property.name == "log"
                && matches!(&member.object, Expression::Identifier(id) if id.name == "console"))
}

fn literal_arrow(arrow: &ArrowFunctionExpression<'_>) -> bool {
    if arrow.r#async || !arrow.params.items.is_empty() || arrow.params.rest.is_some() {
        return false;
    }
    match &arrow.body {
        ArrowFunctionBody::StringLiteral(_)
        | ArrowFunctionBody::NumericLiteral(_)
        | ArrowFunctionBody::BooleanLiteral(_) => true,
        ArrowFunctionBody::FunctionBody(body) => {
            matches!(body.statements.as_slice(), [Statement::ReturnStatement(statement)] if statement.argument.as_ref().is_some_and(|value| matches!(value, Expression::StringLiteral(_) | Expression::NumericLiteral(_) | Expression::BooleanLiteral(_))))
        }
        _ => false,
    }
}
