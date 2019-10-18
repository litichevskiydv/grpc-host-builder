const asyncContext = require("processing-context");

module.exports = async function(call, methodDefinition, callback, next) {
  asyncContext.create();
  await next(call, callback);
};
