"use client";

import { Icon } from "@iconify/react";
import { useState } from "react";
import styles from "./siteIcon.module.scss";

/**
 * The icon of the site a link points to. It comes from our own server
 * (`/api/favicon`), never from the site or an icon service, and the link
 * symbol stands in while it loads or when the site has none.
 */
export function SiteIcon({ url, size = 14 }: { url: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    // not a link: the symbol below
  }
  if (!host || failed) {
    return <Icon icon="lucide:link" width={size} aria-hidden="true" />;
  }
  return (
    // biome-ignore lint/performance/noImgElement: our own icon endpoint, not something next/image can optimise
    <img
      className={styles.icon}
      src={`/api/favicon?host=${encodeURIComponent(host)}`}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
