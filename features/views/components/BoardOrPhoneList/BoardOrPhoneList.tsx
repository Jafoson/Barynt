"use client";

import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";

/**
 * A board view on a phone (BARY-164). The plain board sends a phone to its
 * list page (`BoardUnlessPhone`); a saved view can't do that — changing its
 * address to the list would mark it unsaved. It shows the list in place
 * instead and leaves the address alone.
 */
export function BoardOrPhoneList({
  board,
  list,
}: {
  board: React.ReactNode;
  list: React.ReactNode;
}) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  return isPhone ? list : board;
}
