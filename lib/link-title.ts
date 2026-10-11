import { fetchPublic } from "@/lib/public-fetch";

// The title of a page a link points to, fetched by this server — see
// `lib/public-fetch.ts`. Only the start of the document is read: a title
// sits in the head.

const MAX_BYTES = 128 * 1024;
const MAX_TITLE = 200;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decode(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (whole, entity: string) => {
      if (entity[0] === "#") {
        const code =
          entity[1].toLowerCase() === "x"
            ? Number.parseInt(entity.slice(2), 16)
            : Number.parseInt(entity.slice(1), 10);
        return Number.isInteger(code) && code > 0 && code < 0x110000
          ? String.fromCodePoint(code)
          : whole;
      }
      return ENTITIES[entity.toLowerCase()] ?? whole;
    },
  );
}

/** The title of an HTML document: `og:title` first, else `<title>`. */
export function titleOfHtml(html: string): string | null {
  const meta =
    html.match(
      /<meta\b[^>]*\bproperty=["']og:title["'][^>]*\bcontent=["']([^"']*)["'][^>]*>/i,
    ) ??
    html.match(
      /<meta\b[^>]*\bcontent=["']([^"']*)["'][^>]*\bproperty=["']og:title["'][^>]*>/i,
    );
  const raw = meta?.[1] ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!raw) return null;
  const title = decode(raw).replace(/\s+/g, " ").trim();
  if (title === "") return null;
  // "GitLab - Speed with control": only what stands before the first
  // spaced dash is the name; the rest is a slogan.
  const [name] = title.split(/\s[-–—]\s/);
  if (name.trim() !== "") return shorten(name.trim());
  return shorten(title);
}

function shorten(title: string): string {
  return title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1)}…` : title;
}

/** The page's title, or `null` if it has none or cannot be reached. */
export async function fetchLinkTitle(link: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  const res = await fetchPublic(url, {
    accept: "text/html",
    maxBytes: MAX_BYTES,
    types: /^(text\/html|application\/xhtml\+xml)$/,
    protocols: ["https:", "http:"],
    truncate: true,
  });
  if (!res) return null;
  return titleOfHtml(
    new TextDecoder("utf-8", { fatal: false }).decode(res.body),
  );
}
