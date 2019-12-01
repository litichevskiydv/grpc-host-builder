module.exports = function(handler) {
  return async (call, callback) => callback(null, await handler(call));
};
