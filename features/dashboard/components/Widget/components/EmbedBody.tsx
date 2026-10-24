"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { WidgetData } from "@/features/dashboard/types";
import type { Widget } from "@/features/dashboard/widgets";
import styles from "../widget.module.scss";

/**
 * A website or an image from an address (BARY-183).
 *
 * The frame gets as little as the page needs to work: its own scripts,
 * cookies, forms and popups — but no way to navigate the dashboard itself
 * (no `allow-top-navigation`), no camera, microphone or location. It
 * learns which site it sits on but not which dashboard: only the origin
 * goes along as referrer — YouTube's player refuses to play without one
 * (error 153). A page that refuses to be
 * framed (checked on the server, `lib/net/embed-check`) shows a way to open
 * it instead of an empty box. In edit mode the dashboard's cover sits above
 * the frame, so dragging the widget isn't swallowed by the page.
 */
export function EmbedBody({
  widget,
  data,
  title,
}: {
  widget: Widget;
  data: Extract<WidgetData, { type: "embed" }>;
  title: string;
}) {
  const t = useTranslations("widgets");
  const { url, embedKind = "website", fit = "cover", refresh } = widget.config;

  if (!url)
    return (
      <div className={styles.empty}>
        <Icon icon="lucide:app-window" width={18} />
        <span>{t("embedNoUrl")}</span>
      </div>
    );

  if (embedKind === "image")
    return <EmbedImage key={url} url={url} fit={fit} title={title} />;

  if (data.framing === "blocked")
    return (
      <div className={styles.embedFallback}>
        <Icon icon="lucide:ban" width={20} />
        <span>{t("embedBlocked")}</span>
        <OpenLink url={url} />
      </div>
    );

  return <EmbedFrame url={url} refresh={refresh} title={title} />;
}

function EmbedFrame({
  url,
  refresh,
  title,
}: {
  url: string;
  refresh?: number;
  title: string;
}) {
  // A new key every few minutes loads the page afresh — a status board,
  // a chart that doesn't update itself.
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!refresh) return;
    const id = setInterval(() => setRound((n) => n + 1), refresh * 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <iframe
      key={round}
      src={url}
      title={title}
      className={styles.embedFrame}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      allow="fullscreen"
      referrerPolicy="strict-origin"
      loading="lazy"
    />
  );
}

function EmbedImage({
  url,
  fit,
  title,
}: {
  url: string;
  fit: string;
  title: string;
}) {
  const t = useTranslations("widgets");
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div className={styles.embedFallback}>
        <Icon icon="lucide:image-off" width={20} />
        <span>{t("embedImageFailed")}</span>
        <OpenLink url={url} />
      </div>
    );
  return (
    // biome-ignore lint/performance/noImgElement: any outside address, not one `next/image` is set up for
    <img
      src={url}
      alt={title}
      className={styles.embedImage}
      data-fit={fit}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function OpenLink({ url }: { url: string }) {
  const t = useTranslations("widgets");
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.embedOpen}
    >
      {t("embedOpen")}
      <Icon icon="lucide:external-link" width={13} />
    </a>
  );
}
