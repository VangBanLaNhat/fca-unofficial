"use strict";

function getType(obj) {
  return Object.prototype.toString.call(obj).slice(8, -1);
}

module.exports = {
  getType
};
