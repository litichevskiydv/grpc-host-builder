const { fromEvent, isObservable } = require("rxjs");
const { takeUntil, catchError } = require("rxjs/operators");

/**
 * @param {import("../index").serviceServerStreamingMethodImplementation<any, any> | import("../index").serviceBidiStreamingMethodImplementation<any, any>} handler
 * @returns {import("../index").handleServerStreamingCall<any, any> | import("../index").handleBidiStreamingCall<any, any>}
 */
module.exports = function(handler) {
  return async call => {
    const result = await handler(call);
    if (result && isObservable(result)) {
      await result
        .pipe(
          takeUntil(fromEvent(call, "cancelled")),
          catchError(err => {
            throw err;
          })
        )
        .forEach(message => call.write(message));
    }
  };
};