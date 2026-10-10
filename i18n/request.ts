import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { getMyPreferences } from "@/features/account/queries";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  // The person's own zone for every formatted date and time — server and
  // client alike. `null` leaves it to the environment, as before.
  const { timeZone } = await getMyPreferences();

  return {
    locale,
    ...(timeZone ? { timeZone } : {}),
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
