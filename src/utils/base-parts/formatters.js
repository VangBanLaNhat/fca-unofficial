/* eslint-disable no-prototype-builtins */
"use strict";

var querystring = require("querystring");
var url = require("url");

var NUM_TO_MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];
var NUM_TO_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function _formatAttachment(attachment1, attachment2) {
  attachment2 = attachment2 || { id: "", image_data: {} };
  attachment1 = attachment1.mercury ? attachment1.mercury : attachment1;
  var blob = attachment1.blob_attachment;
  var type = blob && blob.__typename ? blob.__typename : attachment1.attach_type;

  if (!type && attachment1.sticker_attachment) {
    type = "StickerAttachment";
    blob = attachment1.sticker_attachment;
  } else if (!type && attachment1.extensible_attachment) {
    if (
      attachment1.extensible_attachment.story_attachment &&
      attachment1.extensible_attachment.story_attachment.target &&
      attachment1.extensible_attachment.story_attachment.target.__typename &&
      attachment1.extensible_attachment.story_attachment.target.__typename === "MessageLocation"
    ) {
      type = "MessageLocation";
    } else {
      type = "ExtensibleAttachment";
    }

    blob = attachment1.extensible_attachment;
  }

  switch (type) {
    case "sticker":
      return {
        type: "sticker",
        ID: attachment1.metadata.stickerID.toString(),
        url: attachment1.url,
        packID: attachment1.metadata.packID.toString(),
        spriteUrl: attachment1.metadata.spriteURI,
        spriteUrl2x: attachment1.metadata.spriteURI2x,
        width: attachment1.metadata.width,
        height: attachment1.metadata.height,
        caption: attachment2.caption,
        description: attachment2.description,
        frameCount: attachment1.metadata.frameCount,
        frameRate: attachment1.metadata.frameRate,
        framesPerRow: attachment1.metadata.framesPerRow,
        framesPerCol: attachment1.metadata.framesPerCol,
        stickerID: attachment1.metadata.stickerID.toString(),
        spriteURI: attachment1.metadata.spriteURI,
        spriteURI2x: attachment1.metadata.spriteURI2x
      };
    case "file":
      return {
        type: "file",
        filename: attachment1.name,
        ID: attachment2.id.toString(),
        url: attachment1.url,
        isMalicious: attachment2.is_malicious,
        contentType: attachment2.mime_type,
        name: attachment1.name,
        mimeType: attachment2.mime_type,
        fileSize: attachment2.file_size
      };
    case "photo":
      return {
        type: "photo",
        ID: attachment1.metadata.fbid.toString(),
        filename: attachment1.fileName,
        thumbnailUrl: attachment1.thumbnail_url,
        previewUrl: attachment1.preview_url,
        previewWidth: attachment1.preview_width,
        previewHeight: attachment1.preview_height,
        largePreviewUrl: attachment1.large_preview_url,
        largePreviewWidth: attachment1.large_preview_width,
        largePreviewHeight: attachment1.large_preview_height,
        url: attachment1.metadata.url,
        width: attachment1.metadata.dimensions.split(",")[0],
        height: attachment1.metadata.dimensions.split(",")[1],
        name: attachment1.fileName
      };
    case "animated_image":
      return {
        type: "animated_image",
        ID: attachment2.id.toString(),
        filename: attachment2.filename,
        previewUrl: attachment1.preview_url,
        previewWidth: attachment1.preview_width,
        previewHeight: attachment1.preview_height,
        url: attachment2.image_data.url,
        width: attachment2.image_data.width,
        height: attachment2.image_data.height,
        name: attachment1.name,
        facebookUrl: attachment1.url,
        thumbnailUrl: attachment1.thumbnail_url,
        mimeType: attachment2.mime_type,
        rawGifImage: attachment2.image_data.raw_gif_image,
        rawWebpImage: attachment2.image_data.raw_webp_image,
        animatedGifUrl: attachment2.image_data.animated_gif_url,
        animatedGifPreviewUrl: attachment2.image_data.animated_gif_preview_url,
        animatedWebpUrl: attachment2.image_data.animated_webp_url,
        animatedWebpPreviewUrl: attachment2.image_data.animated_webp_preview_url
      };
    case "share":
      return {
        type: "share",
        ID: attachment1.share.share_id.toString(),
        url: attachment2.href,
        title: attachment1.share.title,
        description: attachment1.share.description,
        source: attachment1.share.source,
        image: attachment1.share.media.image,
        width: attachment1.share.media.image_size.width,
        height: attachment1.share.media.image_size.height,
        playable: attachment1.share.media.playable,
        duration: attachment1.share.media.duration,
        subattachments: attachment1.share.subattachments,
        properties: {},
        animatedImageSize: attachment1.share.media.animated_image_size,
        facebookUrl: attachment1.share.uri,
        target: attachment1.share.target,
        styleList: attachment1.share.style_list
      };
    case "video":
      return {
        type: "video",
        ID: attachment1.metadata.fbid.toString(),
        filename: attachment1.name,
        previewUrl: attachment1.preview_url,
        previewWidth: attachment1.preview_width,
        previewHeight: attachment1.preview_height,
        url: attachment1.url,
        width: attachment1.metadata.dimensions.width,
        height: attachment1.metadata.dimensions.height,
        duration: attachment1.metadata.duration,
        videoType: "unknown",
        thumbnailUrl: attachment1.thumbnail_url
      };
    case "error":
      return {
        type: "error",
        attachment1: attachment1,
        attachment2: attachment2
      };
    case "MessageImage":
      return {
        type: "photo",
        ID: blob.legacy_attachment_id,
        filename: blob.filename,
        thumbnailUrl: blob.thumbnail.uri,
        previewUrl: blob.preview.uri,
        previewWidth: blob.preview.width,
        previewHeight: blob.preview.height,
        largePreviewUrl: blob.large_preview.uri,
        largePreviewWidth: blob.large_preview.width,
        largePreviewHeight: blob.large_preview.height,
        url: blob.large_preview.uri,
        width: blob.original_dimensions.x,
        height: blob.original_dimensions.y,
        name: blob.filename
      };
    case "MessageAnimatedImage":
      return {
        type: "animated_image",
        ID: blob.legacy_attachment_id,
        filename: blob.filename,
        previewUrl: blob.preview_image.uri,
        previewWidth: blob.preview_image.width,
        previewHeight: blob.preview_image.height,
        url: blob.animated_image.uri,
        width: blob.animated_image.width,
        height: blob.animated_image.height,
        thumbnailUrl: blob.preview_image.uri,
        name: blob.filename,
        facebookUrl: blob.animated_image.uri,
        rawGifImage: blob.animated_image.uri,
        animatedGifUrl: blob.animated_image.uri,
        animatedGifPreviewUrl: blob.preview_image.uri,
        animatedWebpUrl: blob.animated_image.uri,
        animatedWebpPreviewUrl: blob.preview_image.uri
      };
    case "MessageVideo":
      return {
        type: "video",
        filename: blob.filename,
        ID: blob.legacy_attachment_id,
        previewUrl: blob.large_image.uri,
        previewWidth: blob.large_image.width,
        previewHeight: blob.large_image.height,
        url: blob.playable_url,
        width: blob.original_dimensions.x,
        height: blob.original_dimensions.y,
        duration: blob.playable_duration_in_ms,
        videoType: blob.video_type.toLowerCase(),
        thumbnailUrl: blob.large_image.uri
      };
    case "MessageAudio":
      return {
        type: "audio",
        filename: blob.filename,
        ID: blob.url_shimhash,
        audioType: blob.audio_type,
        duration: blob.playable_duration_in_ms,
        url: blob.playable_url,
        isVoiceMail: blob.is_voicemail
      };
    case "StickerAttachment":
      return {
        type: "sticker",
        ID: blob.id,
        url: blob.url,
        packID: blob.pack ? blob.pack.id : null,
        spriteUrl: blob.sprite_image,
        spriteUrl2x: blob.sprite_image_2x,
        width: blob.width,
        height: blob.height,
        caption: blob.label,
        description: blob.label,
        frameCount: blob.frame_count,
        frameRate: blob.frame_rate,
        framesPerRow: blob.frames_per_row,
        framesPerCol: blob.frames_per_column,
        stickerID: blob.id,
        spriteURI: blob.sprite_image,
        spriteURI2x: blob.sprite_image_2x
      };
    case "MessageLocation": {
      var urlAttach = blob.story_attachment.url;
      var mediaAttach = blob.story_attachment.media;

      var u = querystring.parse(url.parse(urlAttach).query).u;
      var where1 = querystring.parse(url.parse(u).query).where1;
      var address = where1.split(", ");

      var latitude;
      var longitude;

      try {
        latitude = Number.parseFloat(address[0]);
        longitude = Number.parseFloat(address[1]);
      } catch (_) {
        // noop
      }

      var imageUrl;
      var width;
      var height;

      if (mediaAttach && mediaAttach.image) {
        imageUrl = mediaAttach.image.uri;
        width = mediaAttach.image.width;
        height = mediaAttach.image.height;
      }

      return {
        type: "location",
        ID: blob.legacy_attachment_id,
        latitude: latitude,
        longitude: longitude,
        image: imageUrl,
        width: width,
        height: height,
        url: u || urlAttach,
        address: where1,
        facebookUrl: blob.story_attachment.url,
        target: blob.story_attachment.target,
        styleList: blob.story_attachment.style_list
      };
    }
    case "ExtensibleAttachment":
      return {
        type: "share",
        ID: blob.legacy_attachment_id,
        url: blob.story_attachment.url,
        title: blob.story_attachment.title_with_entities.text,
        description:
          blob.story_attachment.description && blob.story_attachment.description.text,
        source: blob.story_attachment.source
          ? blob.story_attachment.source.text
          : null,
        image:
          blob.story_attachment.media &&
          blob.story_attachment.media.image &&
          blob.story_attachment.media.image.uri,
        width:
          blob.story_attachment.media &&
          blob.story_attachment.media.image &&
          blob.story_attachment.media.image.width,
        height:
          blob.story_attachment.media &&
          blob.story_attachment.media.image &&
          blob.story_attachment.media.image.height,
        playable:
          blob.story_attachment.media && blob.story_attachment.media.is_playable,
        duration:
          blob.story_attachment.media &&
          blob.story_attachment.media.playable_duration_in_ms,
        playableUrl:
          blob.story_attachment.media == null
            ? null
            : blob.story_attachment.media.playable_url,
        subattachments: blob.story_attachment.subattachments,
        properties: blob.story_attachment.properties.reduce(function (obj, cur) {
          obj[cur.key] = cur.value.text;
          return obj;
        }, {}),
        facebookUrl: blob.story_attachment.url,
        target: blob.story_attachment.target,
        styleList: blob.story_attachment.style_list
      };
    case "MessageFile":
      return {
        type: "file",
        filename: blob.filename,
        ID: blob.message_file_fbid,
        url: blob.url,
        isMalicious: blob.is_malicious,
        contentType: blob.content_type,
        name: blob.filename,
        mimeType: "",
        fileSize: -1
      };
    default:
      throw new Error(
        "unrecognized attach_file of type " +
        type +
        "`" +
        JSON.stringify(attachment1, null, 4) +
        " attachment2: " +
        JSON.stringify(attachment2, null, 4) +
        "`"
      );
  }
}

function formatAttachment(attachments, attachmentIds, attachmentMap, shareMap) {
  attachmentMap = shareMap || attachmentMap;
  return attachments
    ? attachments.map(function (val, i) {
      if (!attachmentMap || !attachmentIds || !attachmentMap[attachmentIds[i]]) {
        return _formatAttachment(val);
      }
      return _formatAttachment(val, attachmentMap[attachmentIds[i]]);
    })
    : [];
}

function formatID(id) {
  if (id != undefined && id != null) {
    return id.replace(/(fb)?id[:.]/, "");
  }
  return id;
}

function formatDeltaMessage(m) {
  var md = m.delta.messageMetadata;
  var body = m.delta.body || "";

  function splitCsv(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string") return [];
    return value
      .split(",")
      .map(function (v) { return v.trim(); })
      .filter(function (v) { return v !== ""; });
  }

  function fillMentionsFromTriples(target, ids, offsets, lengths) {
    var max = Math.min(ids.length, offsets.length, lengths.length);
    for (var i = 0; i < max; i++) {
      var id = String(ids[i] || "").trim();
      if (!id) continue;

      var offset = parseInt(offsets[i], 10);
      var length = parseInt(lengths[i], 10);
      if (isNaN(offset) || isNaN(length) || length <= 0) continue;

      target[id] = body.substring(offset, offset + length);
    }
  }

  function readFbTypedValue(node) {
    if (!node || typeof node !== "object") return undefined;
    if (node.asString != null) return node.asString;
    if (node.asLong != null) return node.asLong;
    if (node.asInt != null) return node.asInt;
    return undefined;
  }

  function getGbMentionMapFromMetadata(metadata) {
    if (!metadata || typeof metadata !== "object") return null;
    var d = metadata.data || {};
    var nested = d.data || {};
    var gb = nested.Gb || d.Gb;
    var map = gb && gb.asMap && gb.asMap.data;
    return map && typeof map === "object" ? map : null;
  }

  var mdata =
    m.delta.data === undefined
      ? []
      : m.delta.data.prng === undefined
        ? []
        : JSON.parse(m.delta.data.prng);
  var m_id = mdata.map(function (u) { return u.i; });
  var m_offset = mdata.map(function (u) { return u.o; });
  var m_length = mdata.map(function (u) { return u.l; });
  var mentions = {};
  fillMentionsFromTriples(mentions, m_id, m_offset, m_length);

  // Some payloads provide mentions as CSV fields instead of prng JSON.
  if (Object.keys(mentions).length === 0) {
    var d = m.delta.data || {};
    fillMentionsFromTriples(
      mentions,
      splitCsv(d.mention_ids || m.delta.mention_ids),
      splitCsv(d.mention_offsets || m.delta.mention_offsets),
      splitCsv(d.mention_lengths || m.delta.mention_lengths)
    );
  }

  // Fallback for range-based metadata variants.
  if (Object.keys(mentions).length === 0) {
    var ranges = [];
    if (Array.isArray(m.delta.ranges)) ranges = m.delta.ranges;
    else if (Array.isArray((m.delta.data || {}).ranges)) ranges = m.delta.data.ranges;
    else if (Array.isArray(m.delta.profileRanges)) ranges = m.delta.profileRanges;

    ranges.forEach(function (r) {
      var id =
        (r && r.entity && r.entity.id) ||
        (r && r.id) ||
        (r && r.i);
      var offset = (r && (r.offset != null ? r.offset : r.o));
      var length = (r && (r.length != null ? r.length : r.l));
      fillMentionsFromTriples(mentions, [id], [offset], [length]);
    });
  }

  // Newer payload variant stores mention entries in messageMetadata.data.data.Gb.asMap.data.
  if (Object.keys(mentions).length === 0) {
    var gbMap = getGbMentionMapFromMetadata(md);
    if (gbMap) {
      var ids = [];
      var offsets = [];
      var lengths = [];

      Object.keys(gbMap).forEach(function (k) {
        var row = gbMap[k] && gbMap[k].asMap && gbMap[k].asMap.data;
        if (!row) return;
        ids.push(readFbTypedValue(row.id));
        offsets.push(readFbTypedValue(row.offset));
        lengths.push(readFbTypedValue(row.length));
      });

      fillMentionsFromTriples(mentions, ids, offsets, lengths);
    }
  }

  return {
    type: "message",
    senderID: formatID(md.actorFbId.toString()),
    body: body,
    threadID: formatID((md.threadKey.threadFbId || md.threadKey.otherUserFbId).toString()),
    messageID: md.messageId,
    attachments: (m.delta.attachments || []).map(function (v) { return _formatAttachment(v); }),
    mentions: mentions,
    timestamp: md.timestamp,
    isGroup: !!md.threadKey.threadFbId
  };
}

function formatMessage(m) {
  var originalMessage = m.message ? m.message : m;
  var obj = {
    type: "message",
    senderName: originalMessage.sender_name,
    senderID: formatID(originalMessage.sender_fbid.toString()),
    participantNames: originalMessage.group_thread_info
      ? originalMessage.group_thread_info.participant_names
      : [originalMessage.sender_name.split(" ")[0]],
    participantIDs: originalMessage.group_thread_info
      ? originalMessage.group_thread_info.participant_ids.map(function (v) {
        return formatID(v.toString());
      })
      : [formatID(originalMessage.sender_fbid)],
    body: originalMessage.body || "",
    threadID: formatID((originalMessage.thread_fbid || originalMessage.other_user_fbid).toString()),
    threadName: originalMessage.group_thread_info
      ? originalMessage.group_thread_info.name
      : originalMessage.sender_name,
    location: originalMessage.coordinates ? originalMessage.coordinates : null,
    messageID: originalMessage.mid
      ? originalMessage.mid.toString()
      : originalMessage.message_id,
    attachments: formatAttachment(
      originalMessage.attachments,
      originalMessage.attachmentIds,
      originalMessage.attachment_map,
      originalMessage.share_map
    ),
    timestamp: originalMessage.timestamp,
    timestampAbsolute: originalMessage.timestamp_absolute,
    timestampRelative: originalMessage.timestamp_relative,
    timestampDatetime: originalMessage.timestamp_datetime,
    tags: originalMessage.tags,
    reactions: originalMessage.reactions ? originalMessage.reactions : [],
    isUnread: originalMessage.is_unread
  };

  if (m.type === "pages_messaging") {
    obj.pageID = m.realtime_viewer_fbid.toString();
  }
  obj.isGroup = obj.participantIDs.length > 2;

  return obj;
}

function formatEvent(m) {
  var originalMessage = m.message ? m.message : m;
  var logMessageType = originalMessage.log_message_type;
  var logMessageData;
  if (logMessageType === "log:generic-admin-text") {
    logMessageData = originalMessage.log_message_data.untypedData;
    logMessageType = getAdminTextMessageType(
      originalMessage.log_message_data.message_type
    );
  } else {
    logMessageData = originalMessage.log_message_data;
  }

  return Object.assign(formatMessage(originalMessage), {
    type: "event",
    logMessageType: logMessageType,
    logMessageData: logMessageData,
    logMessageBody: originalMessage.log_message_body
  });
}

function formatHistoryMessage(m) {
  switch (m.action_type) {
    case "ma-type:log-message":
      return formatEvent(m);
    default:
      return formatMessage(m);
  }
}

function getAdminTextMessageType(type) {
  switch (type) {
    case "change_thread_theme":
      return "log:thread-color";
    case "change_thread_nickname":
      return "log:user-nickname";
    case "change_thread_icon":
      return "log:thread-icon";
    default:
      return type;
  }
}

function formatDeltaEvent(m) {
  var logMessageType;
  var logMessageData;

  switch (m.class) {
    case "AdminTextMessage":
      logMessageData = m.untypedData;
      logMessageType = getAdminTextMessageType(m.type);
      break;
    case "ThreadName":
      logMessageType = "log:thread-name";
      logMessageData = { name: m.name };
      break;
    case "ParticipantsAddedToGroupThread":
      logMessageType = "log:subscribe";
      logMessageData = { addedParticipants: m.addedParticipants };
      break;
    case "ParticipantLeftGroupThread":
      logMessageType = "log:unsubscribe";
      logMessageData = { leftParticipantFbId: m.leftParticipantFbId };
      break;
  }

  return {
    type: "event",
    threadID: formatID((m.messageMetadata.threadKey.threadFbId || m.messageMetadata.threadKey.otherUserFbId).toString()),
    logMessageType: logMessageType,
    logMessageData: logMessageData,
    logMessageBody: m.messageMetadata.adminText,
    author: m.messageMetadata.actorFbId,
    participantIDs: m.participants || []
  };
}

function formatTyp(event) {
  return {
    isTyping: !!event.st,
    from: event.from.toString(),
    threadID: formatID((event.to || event.thread_fbid || event.from).toString()),
    fromMobile: event.hasOwnProperty("from_mobile") ? event.from_mobile : true,
    userID: (event.realtime_viewer_fbid || event.from).toString(),
    type: "typ"
  };
}

function formatDeltaReadReceipt(delta) {
  return {
    reader: (delta.threadKey.otherUserFbId || delta.actorFbId).toString(),
    time: delta.actionTimestampMs,
    threadID: formatID((delta.threadKey.otherUserFbId || delta.threadKey.threadFbId).toString()),
    type: "read_receipt"
  };
}

function formatReadReceipt(event) {
  return {
    reader: event.reader.toString(),
    time: event.time,
    threadID: formatID((event.thread_fbid || event.reader).toString()),
    type: "read_receipt"
  };
}

function formatRead(event) {
  return {
    threadID: formatID(((event.chat_ids && event.chat_ids[0]) || (event.thread_fbids && event.thread_fbids[0])).toString()),
    time: event.timestamp,
    type: "read"
  };
}

function formatDate(date) {
  var d = date.getUTCDate();
  d = d >= 10 ? d : "0" + d;
  var h = date.getUTCHours();
  h = h >= 10 ? h : "0" + h;
  var m = date.getUTCMinutes();
  m = m >= 10 ? m : "0" + m;
  var s = date.getUTCSeconds();
  s = s >= 10 ? s : "0" + s;
  return (
    NUM_TO_DAY[date.getUTCDay()] +
    ", " +
    d +
    " " +
    NUM_TO_MONTH[date.getUTCMonth()] +
    " " +
    date.getUTCFullYear() +
    " " +
    h +
    ":" +
    m +
    ":" +
    s +
    " GMT"
  );
}

function formatCookie(arr, targetUrl) {
  return arr[0] + "=" + arr[1] + "; Path=" + arr[3] + "; Domain=" + targetUrl + ".com";
}

function formatThread(data) {
  return {
    threadID: formatID(data.thread_fbid.toString()),
    participants: data.participants.map(formatID),
    participantIDs: data.participants.map(formatID),
    name: data.name,
    nicknames: data.custom_nickname,
    snippet: data.snippet,
    snippetAttachments: data.snippet_attachments,
    snippetSender: formatID((data.snippet_sender || "").toString()),
    unreadCount: data.unread_count,
    messageCount: data.message_count,
    imageSrc: data.image_src,
    timestamp: data.timestamp,
    serverTimestamp: data.server_timestamp,
    muteUntil: data.mute_until,
    isCanonicalUser: data.is_canonical_user,
    isCanonical: data.is_canonical,
    isSubscribed: data.is_subscribed,
    folder: data.folder,
    isArchived: data.is_archived,
    recipientsLoadable: data.recipients_loadable,
    hasEmailParticipant: data.has_email_participant,
    readOnly: data.read_only,
    canReply: data.can_reply,
    cannotReplyReason: data.cannot_reply_reason,
    lastMessageTimestamp: data.last_message_timestamp,
    lastReadTimestamp: data.last_read_timestamp,
    lastMessageType: data.last_message_type,
    emoji: data.custom_like_icon,
    color: data.custom_color,
    adminIDs: data.admin_ids,
    threadType: data.thread_type
  };
}

function formatProxyPresence(presence, userID) {
  if (presence.lat === undefined || presence.p === undefined) return null;
  return {
    type: "presence",
    timestamp: presence.lat * 1000,
    userID: userID,
    statuses: presence.p
  };
}

function formatPresence(presence, userID) {
  return {
    type: "presence",
    timestamp: presence.la * 1000,
    userID: userID,
    statuses: presence.a
  };
}

module.exports = {
  _formatAttachment,
  formatHistoryMessage,
  formatID,
  formatMessage,
  formatDeltaEvent,
  formatDeltaMessage,
  formatProxyPresence,
  formatPresence,
  formatTyp,
  formatDeltaReadReceipt,
  formatCookie,
  formatThread,
  formatReadReceipt,
  formatRead,
  formatDate,
  getAdminTextMessageType
};
