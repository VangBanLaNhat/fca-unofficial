"use strict";

function isE2EEChatJid(value) {
  return (
    typeof value === "string" &&
    /@(user|group)\.facebook\.com$/i.test(value)
  );
}

module.exports = {
  isE2EEChatJid: isE2EEChatJid,
};
