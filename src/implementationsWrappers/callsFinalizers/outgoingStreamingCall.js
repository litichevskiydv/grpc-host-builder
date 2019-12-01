module.exports = function(handler) {
  return async call => {
    await handler(call);
    call.end();
  };
};
