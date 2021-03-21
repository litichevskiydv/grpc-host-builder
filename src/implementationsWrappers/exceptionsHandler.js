const grpc = require("@grpc/grpc-js");
const { GrpcError } = require("grpc-error-extra");

/**
 * @param {Error} error
 * @returns {GrpcError}
 */
const createGrpcError = (error) => {
  return new GrpcError("Unhandled exception has occurred", { innerError: error });
};

/**
 * @param {import(@grpc/grpc-js).MethodDefinition} methodDefinition
 * @param {import(@grpc/grpc-js).handleCall<any, any>} handler
 * @param {import("../index").Logging.ILogger} logger
 * @returns {import(@grpc/grpc-js).handleCall<any, any>}
 */
module.exports = function (methodDefinition, handler, logger) {
  return async (call, callback) => {
    try {
      await handler(call, callback);
    } catch (error) {
      let grpcError = error;
      if (error instanceof GrpcError === false) {
        grpcError = createGrpcError(error);
        logger.error("Unhandled exception has occurred in method {methodName}", {
          error,
          methodName: methodDefinition.path,
        });
      }

      if (callback) callback(grpcError);
      else call.emit("error", grpcError);
    }
  };
};
