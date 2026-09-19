"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { phoneListHref } from "@/features/issues/phone-list";
import { usePathname, useRouter } from "@/i18n/navigation";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";

/**
 * A phone only has the list: the board isn't offered there, so a board route
 * that a phone lands on (a link, a tab, "my issues") sends it to the list of
 * the same view. Everywhere else it renders the board as usual.
 *
 * Wraps the server-rendered board, so on a phone nothing of it is drawn while
 * the redirect is under way.
 */
export function BoardUnlessPhone({ children }: { children: React.ReactNode }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const pathname = usePathname();
  const router = useRouter();
  const query = useSearchParams().toString();

  useEffect(() => {
    if (isPhone) router.replace(phoneListHref(pathname, query));
  }, [isPhone, pathname, query, router]);

  return isPhone ? null : children;
}
