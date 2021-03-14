const { streamToRx } = require("rxjs-stream");

/**
 * @param {import("../../index").handleBidiStreamingCall<any, any>} handler
 * @returns {import("@grpc/grpc-js").handleBidiStreamingCall<any, any>}
 */
module.exports = function (handler) {
  return async (call) => {
    call.source = streamToRx(call);
    await handler(call);
    call.end();
  };
};
