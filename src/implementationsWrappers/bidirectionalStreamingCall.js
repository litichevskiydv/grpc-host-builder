const { fromEvent } = require("rxjs");
const { streamToRx } = require("rxjs-stream");
const { takeUntil, catchError } = require("rxjs/operators");

module.exports = function(methodImplementation) {
  return async call => {
    call.source = streamToRx(call);

    const result = await methodImplementation(call);
    await result
      .pipe(
        takeUntil(fromEvent(call, "cancelled")),
        catchError(err => {
          throw err;
        })
      )
      .forEach(message => call.write(message));

    call.end();
  };
};
