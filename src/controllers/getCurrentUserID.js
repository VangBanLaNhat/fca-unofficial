"use strict";

module.exports = function(defaultFuncs, api, ctx) {
  return function getCurrentUserID(callback) {
    var value = ctx.userID;
    if (typeof callback === "function") {
      callback(null, value);
    }
    return value;
  };
};
