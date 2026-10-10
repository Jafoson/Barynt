"use client";

import { Icon } from "@iconify/react";
import { useEffect, useState } from "react";
import { Label as LabelChip } from "@/components/ui/atoms/Label/Label";
import { SiteIcon } from "@/features/custom-fields/components/SiteIcon/SiteIcon";

/** Titles already asked for in this tab; `null` = the page has none. */
const fetched = new Map<string, string | null>();

/** A link as a chip shows it: the site, without "www." and the path. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

interface Props {
  url: string;
  /** The title the person gave the link, if any. */
  title?: string | null;
  /** Whether the site's icon is shown in front. */
  favicon: boolean;
  /** Without a title of its own, take the page's title (via the server). */
  fetchTitle: boolean;
}

/**
 * A link field's value as a chip: its own title, else the page's title
 * (read by the server, see `/api/link-title`), else the site's name.
 */
export function LinkChip({ url, title, favicon, fetchTitle }: Props) {
  const [pageTitle, setPageTitle] = useState<string | null>(
    fetched.get(url) ?? null,
  );
  const wanted = !title && fetchTitle;

  useEffect(() => {
    if (!wanted || fetched.has(url)) return;
    let alive = true;
    fetch(`/api/link-title?url=${encodeURIComponent(url)}`)
      .then((res) => (res.ok ? res.json() : { title: null }))
      .then((body: { title?: string | null }) => {
        const found = typeof body.title === "string" ? body.title : null;
        fetched.set(url, found);
        if (alive) setPageTitle(found);
      })
      .catch(() => {
        // Not reachable now: the site's name stands, and we ask again later.
      });
    return () => {
      alive = false;
    };
  }, [url, wanted]);

  const shown = title || (fetchTitle ? pageTitle : null) || linkHost(url);

  return (
    <LabelChip size="sm" hasIcon title={url}>
      {favicon ? (
        <SiteIcon url={url} size={13} />
      ) : (
        <Icon icon="lucide:link" width={13} aria-hidden="true" />
      )}
      {shown}
    </LabelChip>
  );
}
