const grpc = require("grpc");
const GRPCError = require("grpc-error");

/**
 * @param {Error} error
 * @returns {GRPCError}
 */
const createGrpcError = error => {
  const stackTrace = error.stack.replace(/\r?\n|\r/g, " ");
  return /^[ -~]*$/.test(stackTrace)
    ? new GRPCError(error, grpc.status.INTERNAL, { stackTrace })
    : new GRPCError(error, grpc.status.INTERNAL);
};

/**
 * @param {import("grpc").MethodDefinition} methodDefinition
 * @param {import("grpc").handleCall<any, any>} handler
 * @param {import("../index").Logging.ILogger} logger
 * @returns {import("grpc").handleCall<any, any>}
 */
module.exports = function(methodDefinition, handler, logger) {
  return async (call, callback) => {
    try {
      await handler(call, callback);
    } catch (error) {
      let grpcError = error;
      if (error instanceof GRPCError === false && error.constructor.toString() !== GRPCError.toString()) {
        logger.error("Unhandled exception has occurred in method {methodName}", {
          error,
          methodName: methodDefinition.path
        });
        grpcError = createGrpcError(error);
      }

      if (callback) callback(grpcError);
      else call.emit("error", grpcError);
    }
  };
};
