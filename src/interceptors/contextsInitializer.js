const processingContext = require("processing-context");

module.exports = async function(call, methodDefinition, next) {
  processingContext.create();
  return next(call);
};
