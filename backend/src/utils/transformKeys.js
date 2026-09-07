function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function transformKeys(obj) {
  if (Array.isArray(obj)) return obj.map(transformKeys);
  if (obj && typeof obj === "object" && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => {
        const camelKey = toCamelCase(k);
        const transformed = transformKeys(v);
        if (k !== camelKey) {
          return [[camelKey, transformed], [k, transformed]];
        }
        return [[k, transformed]];
      }).flat()
    );
  }
  return obj;
}

function toSnakeKeys(obj) {
  if (Array.isArray(obj)) return obj.map(toSnakeKeys);
  if (obj && typeof obj === "object" && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
        toSnakeKeys(v),
      ])
    );
  }
  return obj;
}

module.exports = { transformKeys, toSnakeKeys };
