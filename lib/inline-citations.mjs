const CODE_SPAN_PATTERN = /```[\s\S]*?(?:```|$)|`[^`\n]*(?:`|$)/g;
const LINK_PATTERN = /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)(?:\s+"([^"\n]*)")?\)|(https?:\/\/[^\s<>"'`]+)/g;

function appendText(segments, text) {
  if (!text) return;
  const last = segments.at(-1);
  if (last?.type === "text") {
    last.text += text;
  } else {
    segments.push({ type: "text", text });
  }
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function trimBareUrl(value) {
  let url = value;
  while (/[.,!?;:]$/.test(url)) {
    url = url.slice(0, -1);
  }

  while (
    url.endsWith(")") &&
    (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)
  ) {
    url = url.slice(0, -1);
  }

  return url;
}

function parseProse(text, segments) {
  LINK_PATTERN.lastIndex = 0;
  let cursor = 0;
  let match;

  while ((match = LINK_PATTERN.exec(text))) {
    const isMarkdownLink = match[2] !== undefined;
    const original = match[0];
    const url = isMarkdownLink ? match[2] : trimBareUrl(match[4]);
    const consumedUrl = isMarkdownLink ? original.length : url.length;
    const citationUrl = isMarkdownLink ? url : original.slice(0, consumedUrl);

    appendText(segments, text.slice(cursor, match.index));
    if (!isHttpUrl(citationUrl)) {
      appendText(segments, original);
    } else {
      segments.push({
        type: "citation",
        label: isMarkdownLink ? match[1].trim() : "",
        title: isMarkdownLink ? match[3] ?? null : null,
        url: citationUrl,
      });
      if (!isMarkdownLink && consumedUrl < original.length) {
        appendText(segments, original.slice(consumedUrl));
      }
    }
    cursor = match.index + original.length;
  }

  appendText(segments, text.slice(cursor));
}

export function parseInlineCitations(text) {
  const segments = [];
  CODE_SPAN_PATTERN.lastIndex = 0;
  let cursor = 0;
  let code;

  while ((code = CODE_SPAN_PATTERN.exec(text))) {
    parseProse(text.slice(cursor, code.index), segments);
    appendText(segments, code[0]);
    cursor = code.index + code[0].length;
  }

  parseProse(text.slice(cursor), segments);
  return segments;
}

export function getUniqueCitationSources(segments) {
  const seen = new Set();
  const sources = [];

  for (const segment of segments) {
    if (segment.type !== "citation" || seen.has(segment.url)) continue;
    seen.add(segment.url);
    sources.push(segment);
  }

  return sources;
}
