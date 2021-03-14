const processingContext = require("processing-context");

/**
 * @param {import("../index").ServiceCall} call
 * @param {import("@grpc/grpc-js").MethodDefinition} methodDefinition
 * @param {import("../index").handleServiceCall<any, any>} next
 */
module.exports = async function (call, methodDefinition, next) {
  processingContext.create();
  return next(call);
};
