"use strict";

var fs = require("fs");
var bluebird = require("bluebird");
var utils = require("../utils");

function stringifyUploadResponse(resData) {
  if (resData instanceof Error) {
    var errInfo = {
      name: resData.name,
      message: resData.message
    };
    if (resData.code !== undefined) errInfo.code = resData.code;
    if (resData.statusCode !== undefined) errInfo.statusCode = resData.statusCode;
    try {
      return JSON.stringify(errInfo);
    } catch (_) {
      return String(resData.message || resData);
    }
  }

  if (resData && typeof resData === "object") {
    var commonErr = {
      message: resData.message,
      error: resData.error,
      code: resData.code,
      statusCode: resData.statusCode
    };
    if (
      commonErr.message !== undefined ||
      commonErr.error !== undefined ||
      commonErr.code !== undefined ||
      commonErr.statusCode !== undefined
    ) {
      try {
        return JSON.stringify(commonErr);
      } catch (_) {
        return String(resData);
      }
    }
  }

  try {
    return JSON.stringify(resData);
  } catch (_) {
    return String(resData);
  }
}

function pickUploadRequestDebug(rawRes) {
  var req = rawRes && rawRes.request ? rawRes.request : null;
  var headers = req && req.headers ? req.headers : {};
  var query = req && req.uri && req.uri.query && typeof req.uri.query === "object"
    ? req.uri.query
    : {};

  return {
    method: req && req.method ? req.method : undefined,
    host: headers.host || headers.Host,
    origin: headers.origin || headers.Origin,
    referer: headers.referer || headers.Referer,
    userAgent: headers["user-agent"] || headers["User-Agent"],
    contentType: headers["content-type"] || headers["Content-Type"],
    xFbLsd: headers["x-fb-lsd"] || headers["X-FB-LSD"],
    xAsbdId: headers["x-asbd-id"] || headers["X-ASBD-ID"],
    secFetchSite: headers["sec-fetch-site"] || headers["Sec-Fetch-Site"],
    secFetchMode: headers["sec-fetch-mode"] || headers["Sec-Fetch-Mode"],
    secFetchDest: headers["sec-fetch-dest"] || headers["Sec-Fetch-Dest"],
    hasCookie: !!(headers.cookie || headers.Cookie),
    queryKeys: Object.keys(query)
  };
}

function extractUploadMetadata(resData) {
  var rawMetadata =
    resData &&
    resData.payload
      ? resData.payload.metadata
      : null;

  if (Array.isArray(rawMetadata)) {
    return rawMetadata;
  }

  if (rawMetadata && typeof rawMetadata === "object") {
    return Object.keys(rawMetadata)
      .sort(function (a, b) {
        return Number(a) - Number(b);
      })
      .map(function (key) {
        return rawMetadata[key];
      });
  }

  return [];
}

function extractStatusCode(err) {
  if (!err) return null;
  if (typeof err.statusCode === "number") return err.statusCode;

  var message = "";
  if (typeof err === "string") message += err;
  if (err && typeof err.message === "string") message += " " + err.message;
  if (err && typeof err.error === "string") message += " " + err.error;

  var match = message.match(/status code:\s*(\d{3})/i);
  return match ? Number(match[1]) : null;
}

function shouldTryLegacyHostFallback(err) {
  var statusCode = extractStatusCode(err);
  if (statusCode === 408 || statusCode === 429) return true;
  if (typeof statusCode === "number" && statusCode >= 500 && statusCode < 600) return true;
  return false;
}

module.exports = function createUploadAttachment(defaultFuncs, ctx, logger) {
  function writeError(message) {
    if (logger && typeof logger.error === "function") {
      logger.error("uploadAttachment", message);
    }
    console.error("uploadAttachment", message);
  }

  return function uploadAttachment(attachments, callback) {
    var uploads = [];

    for (let i = 0; i < attachments.length; i++) {
      let attachment = attachments[i];
      let attachmentPath =
        attachment && typeof attachment.path === "string"
          ? attachment.path
          : null;

      if (!utils.isReadableStream(attachment)) {
        throw {
          error:
            "Attachment should be a readable stream and not " +
            utils.getType(attachment) +
            "."
        };
      }

      const form = {
        farr: attachment,
        voice_clip: "true"
      };

      uploads.push(
        bluebird.resolve()
          .then(function () {
            return defaultFuncs.postFormData(
              "https://www.facebook.com/ajax/mercury/upload.php",
              ctx.jar,
              form,
              {}
            );
          })
          .then(function (rawRes) {
            return {
              rawRes: rawRes,
              uploadReqDebug: pickUploadRequestDebug(rawRes)
            };
          })
          .then(function (bundle) {
            return utils.parseAndCheckLogin(ctx, defaultFuncs)(bundle.rawRes)
              .then(function (resData) {
                return {
                  resData: resData,
                  uploadReqDebug: bundle.uploadReqDebug
                };
              });
          })
          .then(function (bundle) {
            var resData = bundle.resData;
            var uploadReqDebug = bundle.uploadReqDebug;

            if (resData.error) {
              throw resData;
            }

            var metadata = extractUploadMetadata(resData);
            if (metadata.length) {
              return metadata[0];
            }

            writeError("Raw upload response (empty metadata): " + stringifyUploadResponse(resData));
            writeError("Upload request debug: " + stringifyUploadResponse(uploadReqDebug));

            if (!attachmentPath) {
              throw {
                error: "Upload succeeded but did not return attachment metadata.",
                res: resData
              };
            }

            var fallbackForm = {
              upload_1024: fs.createReadStream(attachmentPath),
              voice_clip: "true"
            };

            return defaultFuncs
              .postFormData(
                "https://upload.facebook.com/ajax/mercury/upload.php",
                ctx.jar,
                fallbackForm,
                {}
              )
              .then(function (fallbackRawRes) {
                return {
                  fallbackRawRes: fallbackRawRes,
                  fallbackReqDebug: pickUploadRequestDebug(fallbackRawRes)
                };
              })
              .then(function (fallbackBundle) {
                return utils.parseAndCheckLogin(ctx, defaultFuncs)(fallbackBundle.fallbackRawRes)
                  .then(function (fallbackData) {
                    return {
                      fallbackData: fallbackData,
                      fallbackReqDebug: fallbackBundle.fallbackReqDebug
                    };
                  });
              })
              .then(function (fallbackBundle) {
                var fallbackData = fallbackBundle.fallbackData;
                var fallbackReqDebug = fallbackBundle.fallbackReqDebug;

                if (fallbackData.error) {
                  throw fallbackData;
                }

                var fallbackMetadata = extractUploadMetadata(fallbackData);
                if (fallbackMetadata.length) {
                  return fallbackMetadata[0];
                }

                writeError("Raw upload response (legacy fallback empty metadata): " + stringifyUploadResponse(fallbackData));
                writeError("Legacy upload request debug: " + stringifyUploadResponse(fallbackReqDebug));

                throw {
                  error: "Upload succeeded but did not return attachment metadata.",
                  res: fallbackData,
                  firstRes: resData
                };
              });
          })
          .catch(function (primaryErr) {
            if (!attachmentPath || !shouldTryLegacyHostFallback(primaryErr)) {
              throw primaryErr;
            }

            var fallbackForm = {
              upload_1024: fs.createReadStream(attachmentPath),
              voice_clip: "true"
            };

            return defaultFuncs
              .postFormData(
                "https://upload.facebook.com/ajax/mercury/upload.php",
                ctx.jar,
                fallbackForm,
                {}
              )
              .then(function (fallbackRawRes) {
                return {
                  fallbackRawRes: fallbackRawRes,
                  fallbackReqDebug: pickUploadRequestDebug(fallbackRawRes)
                };
              })
              .then(function (fallbackBundle) {
                return utils.parseAndCheckLogin(ctx, defaultFuncs)(fallbackBundle.fallbackRawRes)
                  .then(function (fallbackData) {
                    return {
                      fallbackData: fallbackData,
                      fallbackReqDebug: fallbackBundle.fallbackReqDebug
                    };
                  });
              })
              .then(function (fallbackBundle) {
                var fallbackData = fallbackBundle.fallbackData;
                var fallbackReqDebug = fallbackBundle.fallbackReqDebug;

                if (fallbackData.error) {
                  throw fallbackData;
                }

                var fallbackMetadata = extractUploadMetadata(fallbackData);
                if (fallbackMetadata.length) {
                  return fallbackMetadata[0];
                }

                writeError("Raw upload response (legacy host fallback empty metadata): " + stringifyUploadResponse(fallbackData));
                writeError("Legacy host request debug: " + stringifyUploadResponse(fallbackReqDebug));

                throw {
                  error: "Upload succeeded but did not return attachment metadata.",
                  res: fallbackData,
                  firstErr: primaryErr
                };
              });
          })
      );
    }

    bluebird
      .all(uploads)
      .then(function (resData) {
        callback(null, resData);
      })
      .catch(function (err) {
        if (logger && typeof logger.error === "function") {
          logger.error("uploadAttachment", err);
        }
        callback(err);
      });
  };
};
