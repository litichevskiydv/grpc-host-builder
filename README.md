# grpc-host-builder

[![npm version](https://badge.fury.io/js/grpc-host-builder.svg)](https://www.npmjs.com/package/grpc-host-builder)
[![npm downloads](https://img.shields.io/npm/dt/grpc-host-builder.svg)](https://www.npmjs.com/package/grpc-host-builder)
[![dependencies](https://img.shields.io/david/litichevskiydv/grpc-host-builder.svg)](https://www.npmjs.com/package/grpc-host-builder)
[![dev dependencies](https://img.shields.io/david/dev/litichevskiydv/grpc-host-builder.svg)](https://www.npmjs.com/package/grpc-host-builder)
[![Build Status](https://github.com/litichevskiydv/grpc-host-builder/actions/workflows/ci.yaml/badge.svg?branch=master)](https://github.com/litichevskiydv/grpc-host-builder/actions/workflows/ci.yaml)
[![Coverage Status](https://coveralls.io/repos/github/litichevskiydv/grpc-host-builder/badge.svg?branch=master)](https://coveralls.io/github/litichevskiydv/grpc-host-builder?branch=master)

Lightweight configurator for gRPC host

# Install

`npm i grpc-host-builder`

# Usage

```javascript
const { GrpcHostBuilder } = require("grpc-host-builder");

/*...*/

class InterceptorForTom {
  constructor(serverContext) {
    this._logger = serverContext.createLogger();
  }

  async invoke(call, methodDefinition, next) {
    /*...*/

    if (call.request.name === "Tom") return { message: "Hello again, Tom!" };
    return await next(call);
  }
}

/*...*/

const server = await new GrpcHostBuilder()
  .useLoggersFactory(loggersFactory)
  .addInterceptor(InterceptorForTom)
  .addInterceptor(async (call, methodDefinition, next) => {
    if (call.request.name === "Jane") return { message: "Hello dear, Jane!" };
    return await next(call);
  })
  .addService(packageObject.v1.Greeter.service, {
    sayHello: (call) => {
      const request = new HelloRequest(call.request);
      return new HelloResponse({ message: `Hello, ${request.name}!` });
    },
  })
  .bind(grpcBind)
  .buildAsync();
```
