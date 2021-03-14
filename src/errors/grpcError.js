const grpc = require("@grpc/grpc-js");
const { serializeError } = require("serialize-error");

/**
 * @param {any} value
 * @returns {boolean}
 */
function isPassed(value) {
  return value !== undefined && value !== null;
}

module.exports = class GrpcError extends Error {
  /**
   * @param {import("@grpc/grpc-js").status | void} [statusCode]
   * @returns {import("@grpc/grpc-js").status}
   */
  static _getCode(statusCode) {
    return typeof statusCode === "number" && Number.isInteger(statusCode) ? statusCode : grpc.status.INTERNAL;
  }

  /**
   * @param {import("@grpc/grpc-js").Metadata | {[key: string]: string} | void} metadata
   * @param {Array<any> | void} details
   * @param {Error | void} innerError
   * @returns {import("@grpc/grpc-js").Metadata}
   */
  static _getMetadata(metadata, details, innerError) {
    /** @type {import("@grpc/grpc-js").Metadata} */
    let result;
    if (isPassed(metadata) === false) result = new grpc.Metadata();
    else if (metadata instanceof grpc.Metadata) result = metadata.clone();
    else {
      result = new grpc.Metadata();
      Object.entries(metadata).forEach(([key, value]) => {
        if (typeof key === "string" && isPassed(value)) result.add(key, String(value));
      });
    }

    const keyName = "details-bin";
    if (isPassed(innerError)) {
      const stackEntries =
        isPassed(innerError.stack === true) && typeof innerError.stack === "string"
          ? innerError.stack.split("\n").map((line) => line.trim())
          : [];
      result.add(keyName, Buffer.from(JSON.stringify({ detail: innerError.message, stackEntries })));
    } else if (Array.isArray(details) === true) {
      details.forEach((detail, i) => {
        const preparedDetail = Buffer.from(JSON.stringify(serializeError(detail)));
        if (i === 0) result.set(keyName, preparedDetail);
        else result.add(keyName, preparedDetail);
      });
    }

    return result;
  }

  /**
   * @param {string} message
   * @param {GrpcErrorOptions} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);

    this.code = GrpcError._getCode(options.statusCode);
    this.metadata = GrpcError._getMetadata(options.metadata, options.details, options.innerError);
  }
};

/**
 * @typedef {Object} GrpcErrorOptions
 * @property {import("@grpc/grpc-js").status} [statusCode] Response status code.
 * @property {import("@grpc/grpc-js").Metadata | {[key: string]: string}} [metadata] Response metadata.
 * @property {Array<any>} [details] Response details.
 * @property {Error} [innerError] The inner error information.
 */
