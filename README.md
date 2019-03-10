# grpc-host-builder

[![npm version](https://badge.fury.io/js/grpc-host-builder.svg)](https://www.npmjs.com/package/grpc-host-builder)
[![npm downloads](https://img.shields.io/npm/dt/grpc-host-builder.svg)](https://www.npmjs.com/package/grpc-host-builder)
[![dependencies](https://img.shields.io/david/litichevskiydv/grpc-host-builder.svg)](https://www.npmjs.com/package/grpc-host-builder)
[![dev dependencies](https://img.shields.io/david/dev/litichevskiydv/grpc-host-builder.svg)](https://www.npmjs.com/package/grpc-host-builder)
[![Build Status](https://travis-ci.org/litichevskiydv/grpc-host-builder.svg?branch=master)](https://travis-ci.org/litichevskiydv/grpc-host-builder)
[![Coverage Status](https://coveralls.io/repos/github/litichevskiydv/grpc-host-builder/badge.svg?branch=master)](https://coveralls.io/github/litichevskiydv/grpc-host-builder?branch=master)

Lightweight configurator for gRPC host

# Install

`npm i grpc-host-builder`

# Usage

```javascript
const GrpcHostBuilder = require("grpc-host-builder");

/*...*/

class InterceptorForTom {
  constructor(serverContext) {
    this._logger = serverContext.createLogger();
  }

  async invoke(call, methodDefinition, callback, next) {
    /*...*/

    if (call.request.name === "Tom") callback(null, { message: "Hello again, Tom!" });
    else await next(call, callback);
  }
}

/*...*/

const server = new GrpcHostBuilder()
  .useLoggersFactory(loggersFactory)
  .addInterceptor(InterceptorForTom)
  .addInterceptor(async (call, methodDefinition, callback, next) => {
    if (call.request.name === "Jane") callback(null, { message: "Hello dear, Jane!" });
    else await next(call, callback);
  })
  .addService(packageObject.v1.Greeter.service, {
    sayHello: call => {
      const request = new HelloRequest(call.request);
      return new HelloResponse({ message: `Hello, ${request.name}!` });
    }
  })
  .bind(grpcBind)
  .build();
```
