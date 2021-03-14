const { streamToRx } = require("rxjs-stream");

/**
 * @param {import("../../index").handleClientStreamingCall<any, any>} handler
 * @returns {import("@grpc/grpc-js").handleClientStreamingCall<any, any>}
 */
module.exports = function (handler) {
  return async (call, callback) => {
    call.source = streamToRx(call);
    callback(null, await handler(call));
  };
};
