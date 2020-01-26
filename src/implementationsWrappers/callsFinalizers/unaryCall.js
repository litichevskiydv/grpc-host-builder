/**
 * @param {import("../../index").handleUnaryCall<any, any>} handler
 * @returns {import("grpc").handleUnaryCall<any, any>}
 */
module.exports = function(handler) {
  return async (call, callback) => callback(null, await handler(call));
};
