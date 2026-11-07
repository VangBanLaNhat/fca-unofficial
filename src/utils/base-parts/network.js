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

  // Page loads (navigation) and API calls (XHR) send different header sets;
  // one frozen template for both is a browser fingerprint mismatch.
  // Callers mark page loads with requestKind: "navigation"; anything else
  // defaults to XHR.
  var requestKind = "xhr";
  if (customHeader && customHeader.requestKind === "navigation") {
    requestKind = "navigation";
  } else if (ctx && ctx.requestKind === "navigation") {
    requestKind = "navigation";
  }

  var headers = {
    host: host,
    "accept-language": "en-US,en;q=0.9",
    referer: "https://www.facebook.com/",
    connection: "keep-alive",
    "accept-encoding": "gzip, deflate, br",
    "Sec-Fetch-Site": "same-origin",
    "Sec-CH-UA": "\"Google Chrome\";v=\"157\", \"Chromium\";v=\"157\", \"Not-A.Brand\";v=\"24\"",
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": "\"Windows\"",
    "User-Agent": userAgent
  };

  if (requestKind === "navigation") {
    headers.accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
    headers["Sec-Fetch-Mode"] = "navigate";
    headers["Sec-Fetch-Dest"] = "document";
    // No Origin header and no Sec-Fetch-User on navigations.
  } else {
    headers.accept = "*/*";
    headers.origin = "https://www.facebook.com";
    headers["Sec-Fetch-Mode"] = "cors";
    headers["Sec-Fetch-Dest"] = "empty";
    // No Sec-Fetch-User on XHR: browsers only send it on navigations.
  }

  if (customHeader) {
    Object.assign(headers, customHeader);
    if (customHeader.noRef) {
      delete headers.referer;
    }
    delete headers.customUserAgent;
    delete headers.noRef;
    delete headers.requestKind;
  }
  if (ctx && ctx.noRef) {
    delete headers.referer;
  }

  // x-asbd-id is only sent when explicitly configured; the old hardcoded
  // default ("359341") was identical for every install.
  if (ctx && ctx.globalOptions && ctx.globalOptions.asbdID) {
    headers["x-asbd-id"] = String(ctx.globalOptions.asbdID);
  }

  if (ctx && ctx.lsd) {
    headers["x-fb-lsd"] = ctx.lsd;
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
  var headers = getHeaders(url, options, ctx, customHeader);
  if (!headers["content-type"] && !headers["Content-Type"]) {
    headers["content-type"] = "application/x-www-form-urlencoded";
  }

  var op = {
    headers: headers,
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
  var timeout = 60000;

  if (typeof url === "string" && url.indexOf("/ajax/mercury/upload.php") !== -1) {
    var customUploadTimeout = ctx && ctx.globalOptions
      ? Number(ctx.globalOptions.uploadAttachmentTimeout)
      : NaN;

    if (!isNaN(customUploadTimeout) && customUploadTimeout > 0) {
      timeout = customUploadTimeout;
    } else {
      timeout = 180000;
    }
  }

  var op = {
    headers: headers,
    timeout: timeout,
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
