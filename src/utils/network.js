"use strict";

var base = require("./base");

module.exports = {
  isReadableStream: base.isReadableStream,
  get: base.get,
  post: base.post,
  postFormData: base.postFormData,
  getJar: base.getJar,
  setProxy: base.setProxy
};
