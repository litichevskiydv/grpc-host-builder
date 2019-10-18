const processingContext = require("processing-context");

module.exports = async function(call, methodDefinition, callback, next) {
  processingContext.create();
  await next(call, callback);
};
