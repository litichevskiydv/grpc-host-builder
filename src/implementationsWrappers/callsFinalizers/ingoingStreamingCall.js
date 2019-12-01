const { streamToRx } = require("rxjs-stream");

module.exports = function(handler) {
  return async (call, callback) => {
    call.source = streamToRx(call);
    callback(null, await handler(call));
  };
};
