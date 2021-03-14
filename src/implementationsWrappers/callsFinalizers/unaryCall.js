/**
 * @param {import("../../index").handleUnaryCall<any, any>} handler
 * @returns {import("@grpc/grpc-js").handleUnaryCall<any, any>}
 */
module.exports = function (handler) {
  return async (call, callback) => callback(null, await handler(call));
};
