"use strict";

function isE2EEChatJid(value) {
  return (
    typeof value === "string" &&
    value.indexOf("@") !== -1
  );
}

module.exports = {
  isE2EEChatJid: isE2EEChatJid,
};
