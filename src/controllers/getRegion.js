"use strict";

module.exports = function (defaultFuncs, api, ctx) {
  return function getRegion(callback) {
    var value = ctx && ctx.region;
    if (typeof callback === "function") {
      callback(null, value);
    }
    return value;
  };
};
