/* eslint-env node */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

module.exports = function ({ types: t }) {
  let programPath;
  let vueImported = false;
  let makeRefImported = false;

  function importVueOnce(t) {
    if (vueImported) return;
    programPath.unshiftContainer(
      'body',
      t.importDeclaration([t.importDefaultSpecifier(t.identifier('Vue'))], t.stringLiteral('vue'))
    );
    vueImported = true;
  }

  function importMakeRefOnce(t) {
    if (makeRefImported) return;
    programPath.unshiftContainer(
      'body',
      t.importDeclaration(
        [t.importSpecifier(t.identifier('_makeRef'), t.identifier('makeRef'))],
        t.stringLiteral('babel-plugin-firetruss-runtime')
      )
    );
    makeRefImported = true;
  }

  return {
    visitor: {

      Program(path) {
        programPath = path;
      },

      UnaryExpression(path, state) {
        const arg = path.node.argument;
        if (path.node.operator === 'delete' && t.isMemberExpression(arg)) {
          path.replaceWith(t.callExpression(
            t.memberExpression(t.identifier('Vue'), t.identifier('delete')),
            [arg.object, arg.computed ? arg.property : t.stringLiteral(arg.proprety.name)]
          ));
          importVueOnce(t);
        }
      },

      AssignmentExpression(path, state) {
        const left = path.node.left;
        if (path.node.operator === '=' && t.isMemberExpression(left)) {
          const rootIdentifier = getRootIdentifier(t, left);
          if (rootIdentifier !== 'window' && rootIdentifier !== 'exports') {
            path.replaceWith(t.callExpression(
              t.memberExpression(t.identifier('Vue'), t.identifier('set')),
              [
                left.object,
                left.computed ? left.property : t.stringLiteral(left.property.name),
                path.node.right
              ]
            ));
            importVueOnce(t);
          }
        }
      },

      MemberExpression(path, state) {
        const property = path.node.property;
        if (!path.node.computed && (property.name === '$ref' || property.name === '$refs')) {
          let node = path.node.object;
          const args = [];
          while (true) {
            if (!t.isMemberExpression(node) ||
                !node.computed && (
                  node.property.name.charAt(0) === '$' ||
                  node.property.name.slice(-3) === 'Ref')) break;
            args.unshift(node.computed ? node.property : t.stringLiteral(node.property.name));
            node = node.object;
          }
          if (args.length) {
            const methodName = property.name === '$ref' ? 'child' : 'children';
            args.unshift(t.stringLiteral(methodName));
            args.unshift(node);
            path.replaceWith(t.callExpression(t.identifier('_makeRef'), args));
            importMakeRefOnce(t);
          }
        }
      }
    }
  };
};


function getRootIdentifier(t, memberExpression) {
  if (t.isIdentifier(memberExpression.object)) return memberExpression.object.name;
  if (t.isMemberExpression(memberExpression.object)) {
    return getRootIdentifier(t, memberExpression.object);
  }
}
