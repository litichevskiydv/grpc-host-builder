/**
 * @param {import("../../index").handleServerStreamingCall<any, any>} handler
 * @returns {import("@grpc/grpc-js").handleServerStreamingCall<any, any>}
 */
module.exports = function (handler) {
  return async (call) => {
    await handler(call);
    call.end();
  };
};
