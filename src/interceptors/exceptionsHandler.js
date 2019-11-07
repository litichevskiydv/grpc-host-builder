const grpc = require("grpc");
const GRPCError = require("grpc-error");

module.exports = class Interceptor {
  constructor(serverContext) {
    this._logger = serverContext.createLogger();
  }

  /**
   * @param {Error} error
   */
  static _createGrpcError(error) {
    const stackTrace = error.stack.replace(/\r?\n|\r/g, " ");
    return /^[ -~]*$/.test(stackTrace)
      ? new GRPCError(error, grpc.status.INTERNAL, { stackTrace })
      : new GRPCError(error, grpc.status.INTERNAL);
  }

  async invoke(call, methodDefinition, callback, next) {
    try {
      await next(call, callback);
    } catch (error) {
      let grpcError = error;
      if (error instanceof GRPCError === false && error.constructor.toString() !== GRPCError.toString()) {
        this._logger.error("Unhandled exception has occurred in method {methodName}", { error, methodName: methodDefinition.path }); // prettier-ignore
        grpcError = Interceptor._createGrpcError(error);
      }

      if (callback) callback(grpcError);
      else call.emit("error", grpcError);
    }
  }
};
