module.exports = function({types}) {
  const t = types;
  let programPath;
  let runtimeImported = false;

  function importRuntimeOnce() {
    if (runtimeImported) return;
    programPath.unshiftContainer(
      'body',
      t.importDeclaration(
        [
          t.importSpecifier(t.identifier('_makeRef'), t.identifier('makeRef')),
          t.importSpecifier(t.identifier('_set'), t.identifier('set')),
          t.importSpecifier(t.identifier('_del'), t.identifier('del')),
        ],
        t.stringLiteral('firetruss-plugin-runtime')
      )
    );
    runtimeImported = true;
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
            t.identifier('_del'),
            [arg.object, arg.computed ? arg.property : t.stringLiteral(arg.proprety.name)]
          ));
          importRuntimeOnce();
        }
      },

      AssignmentExpression(path, state) {
        const left = path.node.left;
        if (path.node.operator === '=' && t.isMemberExpression(left)) {
          const rootIdentifier = getRootIdentifier(t, left);
          if (rootIdentifier !== 'window' && rootIdentifier !== 'exports') {
            path.replaceWith(t.callExpression(
              t.identifier('_set'),
              [
                left.object,
                left.computed ? left.property : t.stringLiteral(left.property.name),
                path.node.right
              ]
            ));
            importRuntimeOnce();
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
            importRuntimeOnce(t);
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
