const { fromEvent } = require("rxjs");
const { takeUntil, catchError } = require("rxjs/operators");

module.exports = function(methodImplementation) {
  return async call => {
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
