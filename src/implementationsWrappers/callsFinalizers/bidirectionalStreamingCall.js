const { streamToRx } = require("rxjs-stream");

module.exports = function(handler) {
  return async call => {
    call.source = streamToRx(call);
    await handler(call);
    call.end();
  };
};
