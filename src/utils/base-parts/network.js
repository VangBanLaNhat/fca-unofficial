"use strict";

var bluebird = require("bluebird");
var request = bluebird.promisify(require("request").defaults({ jar: true }));
var stream = require("stream");
var getType = require("./type").getType;

function setProxy(url) {
  if (typeof url == undefined) {
    return request = bluebird.promisify(require("request").defaults({ jar: true }));
  }
  return request = bluebird.promisify(require("request").defaults({
    jar: true,
    proxy: url
  }));
}

function getHeaders(url, options, ctx, customHeader) {
  var host;
  try {
    host = new URL(url).hostname;
  } catch (_) {
    host = url.replace("https://", "").split("/")[0];
  }

  var userAgent = customHeader && customHeader.customUserAgent
    ? customHeader.customUserAgent
    : options.userAgent;

  var headers = {
    host: host,
    "content-type": "application/x-www-form-urlencoded",
    referer: "https://www.facebook.com/",
    origin: "https://www.facebook.com",
    connection: "keep-alive",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "User-Agent": userAgent
  };
  if (customHeader) {
    Object.assign(headers, customHeader);
    if (customHeader.noRef) {
      delete headers.referer;
    }
    delete headers.customUserAgent;
    delete headers.noRef;
  }
  if (ctx && ctx.region) {
    headers["X-MSGR-Region"] = ctx.region;
  }

  return headers;
}

function isReadableStream(obj) {
  return (
    obj instanceof stream.Stream &&
    (getType(obj._read) === "Function" ||
      getType(obj._read) === "AsyncFunction") &&
    getType(obj._readableState) === "Object"
  );
}

function get(url, jar, qs, options, ctx, customHeader) {
  if (getType(qs) === "Object") {
    for (var prop in qs) {
      if (Object.prototype.hasOwnProperty.call(qs, prop) && getType(qs[prop]) === "Object") {
        qs[prop] = JSON.stringify(qs[prop]);
      }
    }
  }
  var op = {
    headers: getHeaders(url, options, ctx, customHeader),
    timeout: 60000,
    qs: qs,
    url: url,
    method: "GET",
    jar: jar,
    gzip: true
  };

  return request(op).then(function (res) {
    return res[0];
  });
}

function post(url, jar, form, options, ctx, customHeader) {
  var op = {
    headers: getHeaders(url, options, ctx, customHeader),
    timeout: 60000,
    url: url,
    method: "POST",
    form: form,
    jar: jar,
    gzip: true
  };

  return request(op).then(function (res) {
    return res[0];
  });
}

function postFormData(url, jar, form, qs, options, ctx) {
  var headers = getHeaders(url, options, ctx);
  headers["Content-Type"] = "multipart/form-data";
  var op = {
    headers: headers,
    timeout: 60000,
    url: url,
    method: "POST",
    formData: form,
    qs: qs,
    jar: jar,
    gzip: true
  };

  return request(op).then(function (res) {
    return res[0];
  });
}

module.exports = {
  setProxy,
  getHeaders,
  isReadableStream,
  get,
  post,
  postFormData,
  getJar: request.jar
};
