"use client";
import { Icon } from "@iconify/react";
import { type CSSProperties, useState } from "react";
import { initials, personInitials } from "@/lib/utils/string";
import type { User } from "@/types";
import styles from "./avatar.module.scss";

// Two variants: named entities (workspace, ...) with a single `name`,
// and people (User) with separate `firstName`/`lastName` for correct initials.
export type PersonAvatarData = {
  firstName: string;
  lastName: string;
  color: string;
  image?: string;
  /** For the initials abbreviation when first and last name (both optional)
   *  are empty — the handle is the only value guaranteed to exist for
   *  every person. */
  handle?: string;
};

export type AvatarData =
  | { name: string; color: string; image?: string }
  | PersonAvatarData;

export type AvatarShape = "circle" | "square";

interface AvatarProps {
  avatar: AvatarData | null;
  size?: number;
  /**
   * Font size of the initials. Number = px, string = arbitrary CSS value.
   * When omitted, it scales proportionally to `size`.
   */
  fontSize?: number | string;
  /**
   * Round or rounded square. Default: people are round,
   * named entities (workspace, team, ...) are square.
   */
  shape?: AvatarShape;
  ring?: boolean;
  /**
   * Render a placeholder instead of nothing when `avatar` is absent —
   * a dashed ring with a person icon that makes the empty assignment visible.
   */
  placeholder?: boolean;
  /** Accessible name of the placeholder, e.g. "Unassigned". */
  placeholderLabel?: string;
  className?: string;
}

const toCssLength = (value: number | string) =>
  typeof value === "number" ? `${value}px` : value;

export function Avatar({
  avatar,
  size = 22,
  fontSize,
  shape,
  ring,
  placeholder,
  placeholderLabel,
  className,
}: AvatarProps) {
  const image = avatar && "image" in avatar ? avatar.image?.trim() : undefined;
  const [imgFailed, setImgFailed] = useState(false);

  // Tied to the URL itself, not just "did it ever fail": a stale `true` from
  // a previous, now-replaced image (re-upload, or an initially broken
  // presigned URL that later resolves) would otherwise hide a perfectly
  // loadable image behind the initials forever. Adjusting state during
  // render (React's own pattern for "reset on prop change") instead of a
  // useEffect, since the reset itself doesn't need a commit to have happened.
  const [trackedImage, setTrackedImage] = useState(image);
  if (image !== trackedImage) {
    setTrackedImage(image);
    setImgFailed(false);
  }

  if (!avatar) {
    if (!placeholder) {
      return null;
    }

    return (
      <span
        className={[
          styles.avatar,
          styles[shape ?? "circle"],
          styles.placeholder,
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ "--avatar-size": `${size}px` } as CSSProperties}
        {...(placeholderLabel
          ? {
              role: "img",
              "aria-label": placeholderLabel,
              title: placeholderLabel,
            }
          : { "aria-hidden": true })}
      >
        <Icon icon="lucide:user" />
      </span>
    );
  }

  const isPerson = "firstName" in avatar;
  const color = avatar.color || "var(--primary)";
  const label = isPerson
    ? personInitials(avatar.firstName, avatar.lastName) ||
      avatar.firstName?.[0]?.toUpperCase() ||
      avatar.handle?.slice(0, 2).toUpperCase() ||
      "?"
    : initials(avatar.name) || avatar.name?.[0]?.toUpperCase() || "?";

  return (
    <span
      className={[
        styles.avatar,
        styles[shape ?? (isPerson ? "circle" : "square")],
        ring ? styles.ring : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-initials={label.length}
      style={
        {
          "--avatar-size": `${size}px`,
          "--avatar-bg": color,
          // Light text on a dark background and vice versa.
          "--avatar-fg": `oklch(from ${color} clamp(0.05, calc((0.60 - l) * 999), 0.95) 0 h)`,
          ...(fontSize !== undefined && {
            "--avatar-font-size": toCssLength(fontSize),
          }),
        } as CSSProperties
      }
    >
      {image && !imgFailed ? (
        <img
          src={image}
          alt=""
          className={styles.img}
          onError={() => setImgFailed(true)}
        />
      ) : (
        label
      )}
    </span>
  );
}

interface AvatarStackProps {
  ids: string[];
  users: User[];
  size?: number;
  max?: number;
  fontSize?: number | string;
  shape?: AvatarShape;
}

export function AvatarStack({
  ids,
  users,
  size = 22,
  max = 4,
  fontSize,
  shape,
}: AvatarStackProps) {
  const shown = ids.slice(0, max);
  const extra = ids.length - shown.length;
  const userById = (id: string) => users.find((u) => u.id === id) ?? null;
  const overlap = -Math.round(size * 0.3);

  return (
    <div className={styles.stack}>
      {shown.map((id, i) => (
        <span key={id} style={{ marginLeft: i ? overlap : 0, zIndex: 10 - i }}>
          <Avatar
            avatar={userById(id)}
            size={size}
            fontSize={fontSize}
            shape={shape}
            ring
          />
        </span>
      ))}
      {extra > 0 && (
        <span
          className={`${styles.avatar} ${styles[shape ?? "circle"]} ${styles.more}`}
          style={
            {
              marginLeft: overlap,
              "--avatar-size": `${size}px`,
              ...(fontSize !== undefined && {
                "--avatar-font-size": toCssLength(fontSize),
              }),
            } as CSSProperties
          }
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
