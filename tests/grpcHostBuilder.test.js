const path = require("path");
const grpc = require("grpc");
const GRPCError = require("grpc-error");
const protoLoader = require("@grpc/proto-loader");
const { GrpcHostBuilder } = require("../src/index");
const { HelloRequest, HelloResponse } = require("./generated/greeter_pb").v1;

const grpcBind = "0.0.0.0:3000";
const packageObject = grpc.loadPackageDefinition(
  protoLoader.loadSync(path.join(__dirname, "./protos/greeter.proto"), {
    includeDirs: [path.join(__dirname, "./include/"), path.join(__dirname, "../node_modules/grpc-tools/bin/")]
  })
);

/**
 * Creates and starts gRPC server
 * @param {function(GrpcHostBuilder):GrpcHostBuilder} configurator Server builder configurator
 */
const createServer = configurator => {
  return configurator(new GrpcHostBuilder())
    .addService(packageObject.v1.Greeter.service, {
      sayHello: call => {
        const request = new HelloRequest(call.request);
        return new HelloResponse({ message: `Hello, ${request.name}!` });
      }
    })
    .bind(grpcBind)
    .build();
};

const getMessage = async name => {
  const client = new packageObject.v1.Greeter(grpcBind, grpc.credentials.createInsecure());

  const message = await new Promise((resolve, reject) => {
    client.sayHello(new HelloRequest({ name: name }), (error, response) => {
      if (error) reject(error);
      else resolve(response.message);
    });
  });
  client.close();

  return message;
};

test("Must build simple server", async () => {
  // Given
  const server = createServer(x => x);

  // When
  const actualMessage = await getMessage("Tom");
  server.forceShutdown();

  // Then
  expect(actualMessage).toBe("Hello, Tom!");
});

test("Must build server with stateless interceptors", async () => {
  // Given
  const server = createServer(x =>
    x
      .addInterceptor(async (call, methodDefinition, callback, next) => {
        if (call.request.name === "Tom") callback(null, { message: "Hello again, Tom!" });
        else await next(call, callback);
      })
      .addInterceptor(async (call, methodDefinition, callback, next) => {
        if (call.request.name === "Jane") callback(null, { message: "Hello dear, Jane!" });
        else await next(call, callback);
      })
  );

  // When
  const messageForTom = await getMessage("Tom");
  const messageForJane = await getMessage("Jane");
  const messageForAlex = await getMessage("Alex");
  server.forceShutdown();

  // Then
  expect(messageForTom).toBe("Hello again, Tom!");
  expect(messageForJane).toBe("Hello dear, Jane!");
  expect(messageForAlex).toBe("Hello, Alex!");
});

class InterceptorForTom {
  async invoke(call, methodDefinition, callback, next) {
    if (call.request.name === "Tom") callback(null, { message: "Hello again, Tom!" });
    else await next(call, callback);
  }
}

test("Must build server with stateful interceptor", async () => {
  // Given
  const server = createServer(x => x.addInterceptor(InterceptorForTom));

  // When
  const messageForTom = await getMessage("Tom");
  const messageForAlex = await getMessage("Alex");
  server.forceShutdown();

  // Then
  expect(messageForTom).toBe("Hello again, Tom!");
  expect(messageForAlex).toBe("Hello, Alex!");
});

test("Must catch and log common error", async () => {
  // Given
  const mockLogger = { error: jest.fn() };
  const mockLoggersFactory = () => mockLogger;

  const server = createServer(x =>
    x
      .addInterceptor(() => {
        throw new Error("Something went wrong");
      })
      .useLoggersFactory(mockLoggersFactory)
  );

  // When, Then
  await expect(getMessage("Tom")).rejects.toEqual(new Error("13 INTERNAL: Something went wrong"));
  expect(mockLogger.error).toBeCalledTimes(1);

  server.forceShutdown();
});

test("Must catch and not log GRPCError", async () => {
  // Given
  const mockLogger = { error: jest.fn() };
  const mockLoggersFactory = () => mockLogger;

  const server = createServer(x =>
    x
      .addInterceptor(() => {
        throw new GRPCError("Wrong payload", grpc.status.INVALID_ARGUMENT, null);
      })
      .useLoggersFactory(mockLoggersFactory)
  );

  // When, Then
  await expect(getMessage("Tom")).rejects.toEqual(new Error("3 INVALID_ARGUMENT: Wrong payload"));
  expect(mockLogger.error).toBeCalledTimes(0);

  server.forceShutdown();
});

test("Must handle error with non ASCII message", async () => {
  // Given
  const mockLogger = { error: jest.fn() };
  const mockLoggersFactory = () => mockLogger;

  const server = createServer(x =>
    x
      .addInterceptor(() => {
        throw new Error("Что-то пошло не так");
      })
      .useLoggersFactory(mockLoggersFactory)
  );

  // When, Then
  await expect(getMessage("Tom")).rejects.toEqual(new Error("13 INTERNAL: Что-то пошло не так"));
  expect(mockLogger.error).toBeCalledTimes(1);

  server.forceShutdown();
});

test("Must throw error if server method was not implemented", () => {
  // Given
  const builder = new GrpcHostBuilder().addService(packageObject.v1.Greeter.service, {});

  // When, Then
  expect(() => builder.build()).toThrowWithMessage(Error, "Method /v1.Greeter/SayHello is not implemented");
});
