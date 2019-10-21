import {
  ServiceDefinition,
  MethodDefinition,
  ServerUnaryCall,
  ServerReadableStream,
  ServerWriteableStream,
  ServerDuplexStream,
  ServiceError,
  Metadata,
  ServerCredentials,
  Server
} from "grpc";
import { type } from "os";

export class GrpcHostBuilder {
  /**
   * @param {object} [options] grpc native options https://grpc.io/grpc/cpp/group__grpc__arg__keys.html
   */
  constructor(options?: object);

  /**
   * Changes default loggers factory
   * @param createLogger Factory method for loggers creation.
   */
  useLoggersFactory(loggersFactory: (options?: object) => Logging.ILogger): GrpcHostBuilder;

  /**
   * Adds new interceptor to pipeline.
   * @param interceptor New interceptor.
   */
  addInterceptor(
    /**
     * @param call Server call.
     * @param methodDefinition Metadata for method implementation.
     * @param callback gRPC server callback.
     * @param next Next layers executor.
     */
    interceptor: (
      call: ServiceCall,
      methodDefinition: MethodDefinition<any, any>,
      callback: sendUnaryData<any> | null,
      next: handleServiceCall<any, any>
    ) => Promise<void>
  ): GrpcHostBuilder;
  /**
   * Adds new interceptor to pipeline.
   * @param interceptor Constructor for new interceptor.
   */
  addInterceptor(interceporConstructor: new (serverContext: ServerContext) => IInterceptor): GrpcHostBuilder;

  /**
   * Adds implementation of a new service.
   * @param definition Definition of the service.
   * @param implementation Implementation of the service.
   */
  addService<ImplementationType = UntypedServiceImplementation>(
    definition: ServiceDefinition<ImplementationType>,
    implementation: ImplementationType
  ): GrpcHostBuilder;

  /**
   * Binds server to endpoint.
   * @param grpcBind Bind for gRPC server in format "address:port".
   * @param [credentials = ServerCredentials.createInsecure()] Server credentials
   */
  bind(grpcBind: string, credentials?: ServerCredentials): GrpcHostBuilder;

  /**
   * Builds the server.
   */
  build(): Server;
}

type ServerContext = {
  createLogger: (options?: object) => Logging.ILogger;
};

type ServiceCall =
  | ServerUnaryCall<any>
  | ServerReadableStream<any>
  | ServerWriteableStream<any>
  | ServerDuplexStream<any, any>;
type sendUnaryData<ResponseType> = (
  error: ServiceError | null,
  value: ResponseType | null,
  trailer?: Metadata,
  flags?: number
) => void;

type handleServiceCall<RequestType, ResponseType> =
  | handleUnaryCall<RequestType, ResponseType>
  | handleClientStreamingCall<RequestType, ResponseType>
  | handleServerStreamingCall<RequestType, ResponseType>
  | handleBidiStreamingCall<RequestType, ResponseType>;
type handleUnaryCall<RequestType, ResponseType> = (
  call: ServerUnaryCall<RequestType>,
  callback: sendUnaryData<ResponseType>
) => Promise<void>;
type handleClientStreamingCall<RequestType, ResponseType> = (
  call: ServerReadableStream<RequestType>,
  callback: sendUnaryData<ResponseType>
) => Promise<void>;
type handleServerStreamingCall<RequestType, ResponseType> = (call: ServerWriteableStream<RequestType>) => Promise<void>;
type handleBidiStreamingCall<RequestType, ResponseType> = (
  call: ServerDuplexStream<RequestType, ResponseType>
) => Promise<void>;

type UntypedServiceImplementation = { [name: string]: serviceMethodImplementation<any, any> };
type serviceMethodImplementation<RequestType, ResponseType> =
  | serviceUnaryMethodImplementation<RequestType, ResponseType>
  | serviceClientStreamingMethodImplementation<RequestType, ResponseType>
  | handleServerStreamingCall<RequestType, ResponseType>
  | handleBidiStreamingCall<RequestType, ResponseType>;
type serviceUnaryMethodImplementation<RequestType, ResponseType> = (
  call: ServerUnaryCall<RequestType>
) => Promise<ResponseType>;
type serviceClientStreamingMethodImplementation<RequestType, ResponseType> = (
  call: ServerReadableStream<RequestType>
) => Promise<ResponseType>;

interface IInterceptor {
  /**
   * Interceptor implementation.
   * @param call Server call.
   * @param methodDefinition Metadata for method implementation.
   * @param callback gRPC server callback.
   * @param next Next layers executor.
   */
  invoke(
    call: ServiceCall,
    methodDefinition: MethodDefinition<any, any>,
    callback: sendUnaryData<any> | null,
    next: handleServiceCall<any, any>
  ): Promise<void>;
}

declare namespace Logging {
  interface ILogger {
    fatal(message: string, payload?: object): void;
    error(message: string, payload?: object): void;
    warn(message: string, payload?: object): void;
    info(message: string, payload?: object): void;
    debug(message: string, payload?: object): void;
  }
}
