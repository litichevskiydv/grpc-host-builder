const { streamToRx } = require("rxjs-stream");
const { catchError } = require("rxjs/operators");

module.exports = function(methodImplementation) {
  return async (call, callback) => {
    call.source = streamToRx(call);
    const result = await methodImplementation(call);

    if (result.subscribe && typeof result.subscribe === "function")
      await result
        .pipe(
          catchError(err => {
            throw err;
          })
        )
        .forEach(message => callback(null, message));
    else callback(null, result);
  };
};
