import Vue from 'vue';

export function makeRef(object, methodName, ...args) {
  for (let i = 0; i < args.length; object = object[args[i++]]) {
    if (object === undefined || object === null) return;
    const ref = object.$ref;
    if (ref && typeof ref[methodName] === 'function') {
      if (typeof args[i] === 'string') {
        const descriptor = Object.getOwnPropertyDescriptor(object, args[i]);
        if (descriptor && (!descriptor.enumerable || isObject(object[args[i]]))) continue;
      }
      return ref[methodName].apply(ref, Array.prototype.slice.call(args, i));
    }
  }
  if (object === undefined || object === null) return;
  if (object.$ref) return object.$ref;
  throw new Error(`No $ref with ${methodName} method found in chain`);
}

function isObject(x) {
  const type = typeof x;
  // eslint-disable-next-line eqeqeq
  return x != null && (type === 'object' || type === 'function');
}

export function set(object, property, value) {
  Vue.set(object, property, value);
}

export function del(object, property) {
  Vue.delete(object, property);
}
