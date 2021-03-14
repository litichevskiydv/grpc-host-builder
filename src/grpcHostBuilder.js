const { Server, ServerCredentials } = require("@grpc/grpc-js");

const { createLogger } = require("./logging/defaultLoggersFactory");
const ContextsInitializer = require("./interceptors/contextsInitializer");
const exceptionsHandler = require("./implementationsWrappers/exceptionsHandler");
const rxToServerWritableStream = require("./implementationsWrappers/rxToServerWritableStream");

module.exports = class GrpcHostBuilder {
  /**
   * @param {object} [options] grpc native options https://grpc.io/grpc/cpp/group__grpc__arg__keys.html
   */
  constructor(options) {
    this._index = 0;
    this._interceptorsDefinitions = [];
    this._servicesDefinitions = [];
    this._methodsImplementationsWrappers = new Map()
      .set("unary", require("./implementationsWrappers/callsFinalizers/unaryCall"))
      .set("clientStream", require("./implementationsWrappers/callsFinalizers/ingoingStreamingCall"))
      .set("serverStream", require("./implementationsWrappers/callsFinalizers/outgoingStreamingCall"))
      .set("bidi", require("./implementationsWrappers/callsFinalizers/bidirectionalStreamingCall"));

    this._server = new Server(options);
    this._serverContext = { createLogger };

    this.addInterceptor(ContextsInitializer);
  }

  /**
   * Changes default loggers factory/
   * @param {loggersFactory} createLogger Factory method for loggers creation.
   */
  useLoggersFactory(createLogger) {
    this._serverContext.createLogger = createLogger;
    return this;
  }

  /**
   * Adds new interceptor to pipeline.
   * @param {interceptorFunction | interceptorConstructor} interceptor New interceptor.
   * @param  {...any} interceptorArguments Interceptor additional arguments.
   */
  addInterceptor(interceptor, ...interceptorArguments) {
    if (interceptor.prototype && typeof interceptor.prototype.invoke === "function")
      return this.addInterceptor(async (call, methodDefinition, next) =>
        new interceptor(this._serverContext, ...interceptorArguments).invoke(call, methodDefinition, next)
      );

    this._interceptorsDefinitions.push({
      index: this._index++,
      interceptor: (call, methodDefinition, next) => interceptor(call, methodDefinition, next, ...interceptorArguments),
    });
    return this;
  }

  /**
   * Adds implementation of a new service.
   * @param {import("@grpc/grpc-js").ServiceDefinition} definition Definition of the service.
   * @param {import("./index").UntypedServiceImplementation} implementation Implementation of the service.
   */
  addService(definition, implementation) {
    this._servicesDefinitions.push({ index: this._index++, definition: definition, implementation: implementation });
    return this;
  }

  /**
   * Binds server to endpoint.
   * @param {string} grpcBind Bind for gRPC server in format "address:port".
   * @param {ServerCredentials} [credentials = ServerCredentials.createInsecure()] Server credentials
   */
  bind(grpcBind, credentials = ServerCredentials.createInsecure()) {
    this._serverBind = grpcBind;
    this._serverCredentials = credentials;
    return this;
  }

  /**
   * @param {import("@grpc/grpc-js").MethodDefinition} methodDefinition
   * @returns {"bidi" | "clientStream" | "serverStream" | "unary"}
   */
  static _getMethodType(methodDefinition) {
    if (methodDefinition.requestStream) return methodDefinition.responseStream ? "bidi" : "clientStream";
    return methodDefinition.responseStream ? "serverStream" : "unary";
  }

  /**
   * @param {number} serviceIndex
   * @param {import("./index").UntypedServiceImplementation} serviceImplementation
   * @param {string} methodName
   * @param {import("@grpc/grpc-js").MethodDefinition} methodDefinition
   * @returns {import("@grpc/grpc-js").handleCall}
   */
  _getMethodImplementation(serviceIndex, serviceImplementation, methodName, methodDefinition) {
    let methodImplementation = serviceImplementation[methodName];
    if (methodImplementation === undefined) methodImplementation = serviceImplementation[methodDefinition.originalName];
    if (methodImplementation === undefined) throw new Error(`Method ${methodDefinition.path} is not implemented`);
    methodImplementation = methodImplementation.bind(serviceImplementation);

    let serviceCallHandler = methodImplementation;
    if (methodDefinition.responseStream) serviceCallHandler = rxToServerWritableStream(serviceCallHandler);

    for (let i = this._interceptorsDefinitions.length - 1; i > -1; i--) {
      const interceptorDefinition = this._interceptorsDefinitions[i];
      if (interceptorDefinition.index > serviceIndex) continue;

      const next = serviceCallHandler;
      serviceCallHandler = async (call) => interceptorDefinition.interceptor(call, methodDefinition, next);
    }

    const methodType = GrpcHostBuilder._getMethodType(methodDefinition);
    serviceCallHandler = this._methodsImplementationsWrappers.get(methodType)(serviceCallHandler);

    return exceptionsHandler(methodDefinition, serviceCallHandler, this._serverContext.createLogger());
  }

  _addServices() {
    for (const { index, definition, implementation } of this._servicesDefinitions)
      for (const methodName in definition) {
        const methodDefinition = definition[methodName];
        const methodType = GrpcHostBuilder._getMethodType(methodDefinition);
        const methodImplementation = this._getMethodImplementation(index, implementation, methodName, methodDefinition);

        this._server.register(
          methodDefinition.path,
          methodImplementation,
          methodDefinition.responseSerialize,
          methodDefinition.requestDeserialize,
          methodType
        );
      }
  }

  /**
   * Builds the server.
   */
  async buildAsync() {
    this._addServices();
    await new Promise((resolve, reject) =>
      this._server.bindAsync(this._serverBind, this._serverCredentials, (error) => {
        if (error !== undefined && error !== null) reject(error);
        else resolve();
      })
    );
    this._server.start();

    return this._server;
  }
};

/**
 * @callback interceptorFunction
 * @param {*} call Server call.
 * @param {*} methodDefinition Metadata for method implementation.
 * @param {*} next Next layers executor.
 * @param {...any} arguments Additional interceptor arguments that were passed during registration.
 * @returns {Promise<any>}
 */

/**
 * @typedef {Object} Interceptor
 * @property {interceptorFunction} invoke Implementation of the interceptor.
 */

/**
 * @callback interceptorConstructor
 * @param {*} serverContext Context of the gRPC server.
 * @param {...any} arguments Additional interceptor arguments that were passed during registration.
 * @returns {Interceptor}
 */

/**
 * @typedef {Object} Logger
 * @property {function(string, any):void} fatal Method for logging events with level fatal.
 * @property {function(string, any):void} error Method for logging events with level error.
 * @property {function(string, any):void} warn Method for logging events with level warn.
 * @property {function(string, any):void} info Method for logging events with level info.
 * @property {function(string, any):void} debug Method for logging events with level debug.
 */

/**
 * @callback loggersFactory
 * @param {*} [options] Logger cration options.
 * @returns {Logger}
 */
