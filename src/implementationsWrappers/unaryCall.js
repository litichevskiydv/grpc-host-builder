module.exports = function(methodImplementation) {
  return async (call, callback) => callback(null, await methodImplementation(call));
};
