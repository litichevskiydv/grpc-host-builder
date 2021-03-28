const path = require("path");
const grpc = require("@grpc/grpc-js");
const { GrpcError } = require("grpc-error-extra");
const protoLoader = require("grpc-pbf-loader").packageDefinition;
const { from, Observable, Subject } = require("rxjs");
const { map, reduce } = require("rxjs/operators");
const { async } = require("rxjs/internal/scheduler/async");

const { GrpcHostBuilder } = require("../src/index");

const {
  HelloRequest: ServerUnaryRequest,
  HelloResponse: ServerUnaryResponse,
  SumResponse: ServerIngoingStreamingResponse,
  RangeRequest: ServerOutgoingStreamingRequest,
  RangeResponse: ServerOutgoingStreamingResponse,
  SelectResponse: ServerBidiStreamingResponse,
} = require("./generated/server/greeter_pb").v1;
const {
  HelloRequest: ClientUnaryRequest,
  SumRequest: ClientOutgoingStreamingRequest,
  RangeRequest: ClientIngoingStreamingRequest,
  SelectRequest: ClientBidiStreamingRequest,
  GreeterClient,
} = require("./generated/client/greeter_client_pb").v1;

grpc.setLogVerbosity(grpc.logVerbosity.ERROR + 1);
expect.extend({
  containsError(received) {
    if (Object.values(received).find((x) => x instanceof Error)) return { pass: true };
    return {
      pass: false,
      message: () => `expected ${received} contains error`,
    };
  },
});

const grpcBind = "0.0.0.0:3000";
const packageObject = grpc.loadPackageDefinition(
  protoLoader.loadSync(path.join(__dirname, "./protos/greeter.proto"), {
    includeDirs: [path.join(__dirname, "./include/")],
  })
);
let server = null;
let client = null;

/**
 * Creates and starts gRPC server
 * @param {function(GrpcHostBuilder):GrpcHostBuilder} configurator Server builder configurator
 */
const createHost = async (configurator) => {
  return await configurator(new GrpcHostBuilder())
    .addService(packageObject.v1.Greeter.service, {
      sayHello: (call) => {
        const request = new ServerUnaryRequest(call.request);
        return new ServerUnaryResponse({
          spanId: call.metadata.get("span_id")[0],
          message: `Hello, ${request.name}!`,
        });
      },
      sum: (call) =>
        call.source
          .pipe(
            reduce((acc, one) => {
              acc.result = acc.result + one.number;
              return acc;
            }, new ServerIngoingStreamingResponse({ result: 0 }))
          )
          .toPromise(),
      range: (call) => {
        const request = new ServerOutgoingStreamingRequest(call.request);
        return new Observable((subscriber) => {
          for (let i = request.from; i <= request.to; i++)
            subscriber.next(new ServerOutgoingStreamingResponse({ result: i }));
          subscriber.complete();
        });
      },
      select: (call) => call.source.pipe(map((x) => new ServerBidiStreamingResponse({ value: x.value + 1 }))),
    })
    .bind(grpcBind)
    .buildAsync();
};

const getMessage = async (name) => {
  const request = new ClientUnaryRequest();
  request.setName(name);

  if (client === null) client = new GreeterClient(grpcBind, grpc.credentials.createInsecure());
  return (await client.sayHello(request)).getMessage();
};

const getSpanId = async (callerSpanId) => {
  const metadata = new grpc.Metadata();
  if (callerSpanId) metadata.set("span_id", callerSpanId);

  const request = new ClientUnaryRequest();
  request.setName("Tester");

  if (client === null) client = new GreeterClient(grpcBind, grpc.credentials.createInsecure());
  return (await client.sayHello(request, metadata)).getSpanId();
};

const prepareErrorMatchingObject = (innerErrorMessage) =>
  expect.objectContaining({
    message: "13 INTERNAL: Unhandled exception has occurred",
    details: [expect.objectContaining({ detail: innerErrorMessage })],
  });

afterEach(() => {
  if (client) {
    client.close();
    client = null;
  }

  if (server) {
    server.forceShutdown();
    server = null;
  }
});

test("Must perform unary call", async () => {
  // Given
  server = await createHost((x) => x);

  // When
  const actualMessage = await getMessage("Tom");

  // Then
  expect(actualMessage).toBe("Hello, Tom!");
});

test("Must perform client streaming call", async () => {
  // Given
  server = await createHost((x) => x);
  client = new GreeterClient(grpcBind, grpc.credentials.createInsecure());
  const numbers = [1, 2, 3, 4, 5, 6, 7];

  // When
  const actualSum = (
    await client.sum(
      from(
        numbers.map((x) => {
          const request = new ClientOutgoingStreamingRequest();
          request.setNumber(x);
          return request;
        })
      )
    )
  ).getResult();

  // Then
  const expectedSum = numbers.reduce((acc, one) => acc + one, 0);
  expect(actualSum).toBe(expectedSum);
});

test("Must perform server streaming call", async () => {
  // Given
  server = await createHost((x) => x);
  client = new GreeterClient(grpcBind, grpc.credentials.createInsecure());

  // When
  const rangeRequest = new ClientIngoingStreamingRequest();
  rangeRequest.setFrom(1);
  rangeRequest.setTo(3);

  const actualNumbers = [];
  await client.range(rangeRequest).forEach((x) => actualNumbers.push(x.getResult()));

  // Then
  const expectedNumbers = [1, 2, 3];
  expect(actualNumbers).toEqual(expectedNumbers);
});

test("Must perform bidirectional streaming call", async () => {
  // Given
  server = await createHost((x) => x);
  client = new GreeterClient(grpcBind, grpc.credentials.createInsecure());

  // When
  const actualNumbers = [];
  const input = new Subject();
  const output = client.select(input);
  output.subscribe((message) => {
    actualNumbers.push(message.getValue());

    if (message <= 5) {
      const request = new ClientBidiStreamingRequest();
      request.setValue(message.getValue() + 1);

      input.next(request);
    } else input.complete();
  });

  const firstRequest = new ClientBidiStreamingRequest();
  firstRequest.setValue(1);
  input.next(firstRequest);

  await output.toPromise();

  // Then
  const expectedNumbers = [2, 4, 6];
  expect(actualNumbers).toEqual(expectedNumbers);
});

test("Must build server with stateless interceptors", async () => {
  // Given
  const interceptor = async (call, methodDefinition, next, person, greetingText) => {
    if (call.request.name === person) return { message: `${greetingText}, ${person}!` };
    return await next(call);
  };
  server = await createHost((x) =>
    x.addInterceptor(interceptor, "Tom", "Hello again").addInterceptor(interceptor, "Jane", "Hello dear")
  );

  // When
  const messageForTom = await getMessage("Tom");
  const messageForJane = await getMessage("Jane");
  const messageForAlex = await getMessage("Alex");

  // Then
  expect(messageForTom).toBe("Hello again, Tom!");
  expect(messageForJane).toBe("Hello dear, Jane!");
  expect(messageForAlex).toBe("Hello, Alex!");
});

class InterceptorForTom {
  constructor(serverContext, person, greetingText) {
    this._person = person;
    this._greetingText = greetingText;
  }
  async invoke(call, methodDefinition, next) {
    if (call.request.name === this._person) return { message: `${this._greetingText}, ${this._person}!` };
    return await next(call);
  }
}

test("Must build server with stateful interceptor", async () => {
  // Given
  server = await createHost((x) => x.addInterceptor(InterceptorForTom, "Tom", "Hello again"));

  // When
  const messageForTom = await getMessage("Tom");
  const messageForAlex = await getMessage("Alex");

  // Then
  expect(messageForTom).toBe("Hello again, Tom!");
  expect(messageForAlex).toBe("Hello, Alex!");
});

test("Must catch and log common error", async () => {
  // Given
  const mockLogger = { error: jest.fn() };
  const mockLoggersFactory = () => mockLogger;
  const errorMessage = "Something went wrong";

  server = await createHost((x) =>
    x
      .addInterceptor(() => {
        throw new Error(errorMessage);
      })
      .useLoggersFactory(mockLoggersFactory)
  );

  // When, Then
  await expect(getMessage("Tom")).rejects.toMatchObject(prepareErrorMatchingObject(errorMessage));
  expect(mockLogger.error).toHaveBeenCalledWith(expect.any(String), expect.containsError());
});

test("Must catch and not log GrpcError", async () => {
  // Given
  const mockLogger = { error: jest.fn() };
  const mockLoggersFactory = () => mockLogger;

  server = await createHost((x) =>
    x
      .addInterceptor(() => {
        throw new GrpcError("Wrong payload", { statusCode: grpc.status.INVALID_ARGUMENT });
      })
      .useLoggersFactory(mockLoggersFactory)
  );

  // When, Then
  await expect(getMessage("Tom")).rejects.toEqual(new Error("3 INVALID_ARGUMENT: Wrong payload"));
  expect(mockLogger.error).toBeCalledTimes(0);
});

test("Must handle error with non ASCII message", async () => {
  // Given
  const mockLogger = { error: jest.fn() };
  const mockLoggersFactory = () => mockLogger;
  const errorMessage = "Что-то пошло не так";

  server = await createHost((x) =>
    x
      .addInterceptor(() => {
        throw new Error(errorMessage);
      })
      .useLoggersFactory(mockLoggersFactory)
  );

  // When, Then
  await expect(getMessage("Tom")).rejects.toMatchObject(prepareErrorMatchingObject(errorMessage));
  expect(mockLogger.error).toBeCalledTimes(1);
});

test("Must throw error if server method was not implemented", async () => {
  // Given
  const builder = new GrpcHostBuilder().addService(packageObject.v1.Greeter.service, {});

  // When, Then
  await expect(() => builder.buildAsync()).rejects.toEqual(new Error("Method /v1.Greeter/SayHello is not implemented"));
});

describe("Must test the handling of exceptions thrown in a client streaming call implementation", () => {
  const testCases = [
    {
      toString: () => "Exception caused by calling subscriber's error method",
      implementation: () => {
        return new Observable((subscriber) => {
          subscriber.error(new Error("Something went wrong"));
        }).toPromise();
      },
    },
    {
      toString: () => "Exception caused in Observable next method",
      implementation: () =>
        from([1])
          .pipe(
            map((x) => {
              if (x === 1) throw new Error("Something went wrong");
            })
          )
          .toPromise(),
    },
    {
      toString: () => "Exception caused before result was returned",
      implementation: () => {
        throw new Error("Something went wrong");
      },
    },
  ];

  test.each(testCases)("%s", async (testCase) => {
    // Given
    const mockLogger = { error: jest.fn() };
    const mockLoggersFactory = () => mockLogger;

    server = await new GrpcHostBuilder()
      .useLoggersFactory(mockLoggersFactory)
      .addService(packageObject.v1.Greeter.service, {
        sayHello: () => {},
        sum: testCase.implementation,
        range: () => {},
        select: () => {},
      })
      .bind(grpcBind)
      .buildAsync();

    // When, Then
    client = new GreeterClient(grpcBind, grpc.credentials.createInsecure());

    const firstRequest = new ClientOutgoingStreamingRequest();
    firstRequest.setNumber(1);

    await expect(client.sum(from([firstRequest]))).rejects.toMatchObject(
      prepareErrorMatchingObject("Something went wrong")
    );
    expect(mockLogger.error).toHaveBeenCalledWith(expect.any(String), expect.containsError());
  });
});

describe("Must test the handling of exceptions thrown in a server streaming call implementation", () => {
  const testCases = [
    {
      toString: () => "Exception caused by calling subscriber's error method",
      implementation: () => {
        return new Observable((subscriber) => {
          subscriber.error(new Error("Something went wrong"));
        });
      },
    },
    {
      toString: () => "Exception caused in Observable next method",
      implementation: () =>
        from([1]).pipe(
          map((x) => {
            if (x === 1) throw new Error("Something went wrong");
          })
        ),
    },
    {
      toString: () => "Exception caused before result was returned",
      implementation: () => {
        throw new Error("Something went wrong");
      },
    },
  ];

  test.each(testCases)("%s", async (testCase) => {
    // Given
    const mockLogger = { error: jest.fn() };
    const mockLoggersFactory = () => mockLogger;

    server = await new GrpcHostBuilder()
      .useLoggersFactory(mockLoggersFactory)
      .addService(packageObject.v1.Greeter.service, {
        sayHello: () => {},
        sum: () => {},
        range: testCase.implementation,
        select: () => {},
      })
      .bind(grpcBind)
      .buildAsync();

    // When, Then
    client = new GreeterClient(grpcBind, grpc.credentials.createInsecure());

    await expect(client.range(new ClientIngoingStreamingRequest()).toPromise()).rejects.toMatchObject(prepareErrorMatchingObject("Something went wrong")); // prettier-ignore
    expect(mockLogger.error).toHaveBeenCalledWith(expect.any(String), expect.containsError());
  });
});

describe("Must test the handling of exceptions thrown in a server bidirectional call implementation", () => {
  const testCases = [
    {
      toString: () => "Exception caused by calling subscriber's error method",
      implementation: () => {
        return new Observable((subscriber) => {
          subscriber.error(new Error("Something went wrong"));
        });
      },
    },
    {
      toString: () => "Exception caused in Observable next method",
      implementation: () =>
        from([1]).pipe(
          map((x) => {
            if (x === 1) throw new Error("Something went wrong");
          })
        ),
    },
    {
      toString: () => "Exception caused before result was returned",
      implementation: () => {
        throw new Error("Something went wrong");
      },
    },
  ];

  test.each(testCases)("%s", async (testCase) => {
    // Given
    const mockLogger = { error: jest.fn() };
    const mockLoggersFactory = () => mockLogger;

    server = await new GrpcHostBuilder()
      .useLoggersFactory(mockLoggersFactory)
      .addService(packageObject.v1.Greeter.service, {
        sayHello: () => {},
        sum: () => {},
        range: () => {},
        select: testCase.implementation,
      })
      .bind(grpcBind)
      .buildAsync();

    // When, Then
    client = new GreeterClient(grpcBind, grpc.credentials.createInsecure());

    const firstRequest = new ClientBidiStreamingRequest();
    firstRequest.setValue(1);

    await expect(client.select(from([firstRequest])).toPromise()).rejects.toMatchObject(prepareErrorMatchingObject("Something went wrong")); // prettier-ignore
    expect(mockLogger.error).toHaveBeenCalledWith(expect.any(String), expect.containsError());
  });
});

test("Must transfer value through metadata", async () => {
  // Given
  const expectedSpanId = "test_span_id";
  server = await createHost((x) => x);

  // When
  const actualSpanId = await getSpanId(expectedSpanId);

  // Then
  expect(actualSpanId).toBe(expectedSpanId);
});
