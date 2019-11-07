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
import { Observable } from "rxjs";

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
type handleUnaryCall<RequestType, ResponseType> = (call: ServerUnaryCall<RequestType>, callback: sendUnaryData<ResponseType>) => Promise<void>; // prettier-ignore
type handleClientStreamingCall<RequestType, ResponseType> = (call: ServerReadableStream<RequestType>, callback: sendUnaryData<ResponseType>) => Promise<void>; // prettier-ignore
type handleServerStreamingCall<RequestType, ResponseType> = (call: ServerWriteableStream<RequestType>) => Promise<void>;
type handleBidiStreamingCall<RequestType, ResponseType> = (call: ServerDuplexStream<RequestType, ResponseType>) => Promise<void>; // prettier-ignore

/**
 * Used for calls that are streaming from the client side.
 */
export interface ServerIngoingStreamingCall<RequestType> {
  /**
   * Indicates if the call has been cancelled
   */
  cancelled: boolean;

  /**
   * The request metadata from the client
   */
  metadata: Metadata;

  /**
   * Client streaming data
   */
  source: Observable<RequestType>;

  /**
   * Get the endpoint this call/stream is connected to.
   * @return The URI of the endpoint
   */
  getPeer(): string;

  /**
   * Send the initial metadata for a writable stream.
   * @param responseMetadata Metadata to send
   */
  sendMetadata(responseMetadata: Metadata): void;
}

/**
 * Used for calls that are streaming from the server side.
 */
export interface ServerOutgoingStreamingCall<RequestType> {
  /**
   * Indicates if the call has been cancelled
   */
  cancelled: boolean;

  /**
   * The request metadata from the client
   */
  metadata: Metadata;

  /**
   * The request message from the client
   */
  request: RequestType;

  /**
   * Get the endpoint this call/stream is connected to.
   * @return The URI of the endpoint
   */
  getPeer(): string;

  /**
   * Send the initial metadata for a writable stream.
   * @param responseMetadata Metadata to send
   */
  sendMetadata(responseMetadata: Metadata): void;
}

/**
 * Used for calls that are bidirectional streaming.
 */
export interface ServerBidiStreamingCall<RequestType> {
  /**
   * Indicates if the call has been cancelled
   */
  cancelled: boolean;

  /**
   * The request metadata from the client
   */
  metadata: Metadata;

  /**
   * Client streaming data
   */
  source: Observable<RequestType>;

  /**
   * Get the endpoint this call/stream is connected to.
   * @return The URI of the endpoint
   */
  getPeer(): string;

  /**
   * Send the initial metadata for a writable stream.
   * @param responseMetadata Metadata to send
   */
  sendMetadata(responseMetadata: Metadata): void;
}

type serviceMethodImplementation<RequestType, ResponseType> =
  | serviceUnaryMethodImplementation<RequestType, ResponseType>
  | serviceClientStreamingMethodImplementation<RequestType, ResponseType>
  | serviceServerStreamingMethodImplementation<RequestType, ResponseType>
  | serviceBidiStreamingMethodImplementation<RequestType, ResponseType>;
type serviceUnaryMethodImplementation<RequestType, ResponseType> = (
  call: ServerUnaryCall<RequestType>
) => Promise<ResponseType>;
type serviceClientStreamingMethodImplementation<RequestType, ResponseType> = (call: ServerIngoingStreamingCall<RequestType>) => Promise<Observable<ResponseType> | ResponseType>; // prettier-ignore
type serviceServerStreamingMethodImplementation<RequestType, ResponseType> = (call: ServerOutgoingStreamingCall<RequestType>) => Promise<Observable<ResponseType>>; // prettier-ignore
type serviceBidiStreamingMethodImplementation<RequestType, ResponseType> = (call: ServerBidiStreamingCall<RequestType>) => Promise<Observable<ResponseType>>; // prettier-ignore
type UntypedServiceImplementation = { [name: string]: serviceMethodImplementation<any, any> };

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
