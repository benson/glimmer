const URL_PATTERN = /https?:\/\/[^\s<>)\]}]+/i;
const TIMECODE_PATTERN = /\b(\d{1,2}):(\d{2})\s*(?:-|–|—|to)\s*(\d{1,2}):(\d{2})\b/i;
const SINGLE_TIMECODE_PATTERN = /\b(\d{1,2}):(\d{2})\b/;

export function cleanUrl(raw) {
  if (!raw) return "";
  return raw.replace(/[.,!?;:'\"]+$/, "");
}

export function findUrl(text = "") {
  return cleanUrl(text.match(URL_PATTERN)?.[0] || "");
}

export function hostnameFor(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function parseTimecode(text = "") {
  const range = text.match(TIMECODE_PATTERN);
  if (range) {
    return {
      start: `${range[1]}:${range[2]}`,
      end: `${range[3]}:${range[4]}`,
      label: `${range[1]}:${range[2]}–${range[3]}:${range[4]}`,
    };
  }

  const single = text.match(SINGLE_TIMECODE_PATTERN);
  if (!single) return null;
  return { start: `${single[1]}:${single[2]}`, end: "", label: `${single[1]}:${single[2]}` };
}

export function inferType(text = "", hasImage = false) {
  if (hasImage) return "image";
  const url = findUrl(text);
  if (url && /\.(?:avif|gif|jpe?g|png|webp)(?:\?.*)?$/i.test(url)) return "image";
  if (parseTimecode(text) || /\b(song|track|album|music|sound|audio|voice|listen)\b/i.test(text)) return "sound";
  if (url) return "site";
  return "note";
}

export function inferTitle(text = "", url = "", type = "note") {
  const withoutUrl = text.replace(URL_PATTERN, "").replace(/^[\s“\"']+|[\s”\"']+$/g, "").trim();
  const generic = withoutUrl.match(/^(?:i\s+)?(?:really\s+)?(?:love|like)\s+(?:this|the)\s+(?:site|song|track|picture|image)\b[.!]?$/i);

  if (url && (!withoutUrl || generic)) return hostnameFor(url);
  if (withoutUrl) {
    const firstLine = withoutUrl.split(/\n|[.!?](?:\s|$)/)[0].trim();
    return firstLine.length > 54 ? `${firstLine.slice(0, 51).trim()}…` : firstLine;
  }

  return type === "image" ? "an image worth keeping" : type === "sound" ? "a beautiful moment" : "untitled glimmer";
}

export function captureFromText(text, options = {}) {
  const value = text.trim();
  const url = findUrl(value);
  const type = options.type || inferType(value, Boolean(options.imageKey || options.image));
  const timecode = parseTimecode(value);

  return {
    type,
    title: options.title?.trim() || inferTitle(value, url, type),
    note: value.replace(URL_PATTERN, "").trim(),
    url,
    ...(timecode ? { timecode } : {}),
  };
}

