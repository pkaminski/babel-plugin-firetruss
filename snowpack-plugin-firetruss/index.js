const basename = require('path').basename;
const recast = require('recast');
const acorn = require('acorn').Parser.extend(require('acorn-stage3'));
const b = recast.types.builders;
const n = recast.types.namedTypes;
const printOptions = {tabWidth: 2, lineTerminator: '\n', wrapColumn: Infinity, quote: 'single'};

const acornParser = {
  parse(source) {
    const comments = [];
    const tokens = [];
    const ast = acorn.parse(source, {
      allowHashBang: true,
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
      onComment: comments,
      onToken: tokens,
    });

    if (!ast.comments) {
      ast.comments = comments;
    }

    if (!ast.tokens) {
      ast.tokens = tokens;
    }

    return ast;
  }
};

module.exports = function() {
  return {
    knownEntrypoints: ['firetruss-plugin-runtime'],
    transform: async ({id, fileExt, contents}) => {
      if (fileExt !== '.js') return;

      let programPath;
      let runtimeImported = false;

      function importRuntimeOnce() {
        if (runtimeImported) return;
        programPath.get('body').unshift(
          b.importDeclaration(
            [
              b.importSpecifier(b.identifier('makeRef'), b.identifier('_makeRef')),
              b.importSpecifier(b.identifier('set'), b.identifier('_set')),
              b.importSpecifier(b.identifier('del'), b.identifier('_del')),
            ],
            b.literal('firetruss-plugin-runtime')
          )
        );
        runtimeImported = true;
      }

      const visitors = {

        visitProgram(path) {
          programPath = path;
          this.traverse(path);
        },

        visitUnaryExpression(path) {
          if (path.node.operator === 'delete') {
            const node = path.node.argument;
            if (n.MemberExpression.check(node)) {
              path.replace(b.callExpression(
                b.identifier('_del'),
                [node.object, node.computed ? node.property : b.literal(node.property.name)]
              ));
              importRuntimeOnce();
            }
          }
          this.traverse(path);
        },

        visitMemberExpression(path) {
          if (!path.node.computed &&
            (path.node.property.name === '$ref' || path.node.property.name === '$refs')) {
            let node = path.node.object;
            const args = [];
            while (true) {
              if (!n.MemberExpression.check(node) ||
                !node.computed && (
                  node.property.name.charAt(0) === '$' ||
                  node.property.name.slice(-3) === 'Ref')) break;
              args.unshift(node.computed ? node.property : b.literal(node.property.name));
              node = node.object;
            }
            if (args.length) {
              const methodName = path.node.property.name === '$ref' ? 'child' : 'children';
              args.unshift(b.literal(methodName));
              args.unshift(node);
              path.replace(b.callExpression(b.identifier('_makeRef'), args));
              importRuntimeOnce();
            }
          }
          this.traverse(path);
        },

        visitAssignmentExpression(path) {
          if (path.node.operator === '=' && n.MemberExpression.check(path.node.left)) {
            const rootIdentifier = getRootIdentifier(path.node.left);
            if (rootIdentifier !== 'window' && rootIdentifier !== 'exports') {
              const left = path.node.left;
              path.replace(b.callExpression(
                b.identifier('_set'),
                [
                  left.object,
                  left.computed ? left.property : b.literal(left.property.name),
                  path.node.right
                ]
              ));
              importRuntimeOnce();
            }
          }
          this.traverse(path);
        }
      };

      const ast = recast.parse(contents, {sourceFileName: id, parser: acornParser});
      recast.types.visit(ast, visitors);
      const result = recast.print(ast, printOptions, {sourceMapName: basename(id) + '.map'});
      return {contents: result.code, map: result.map};
    },
  };
};

function getRootIdentifier(memberExpression) {
  if (n.Identifier.check(memberExpression.object)) return memberExpression.object.name;
  if (n.MemberExpression.check(memberExpression.object)) {
    return getRootIdentifier(memberExpression.object);
  }
}
