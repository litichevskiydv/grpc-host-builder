const { fromEvent } = require("rxjs");
const { takeUntil, catchError } = require("rxjs/operators");

module.exports = function(handler) {
  return async call => {
    const result = await handler(call);
    await result
      .pipe(
        takeUntil(fromEvent(call, "cancelled")),
        catchError(err => {
          throw err;
        })
      )
      .forEach(message => call.write(message));
  };
};
