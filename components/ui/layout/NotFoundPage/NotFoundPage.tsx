import { Icon } from "@iconify/react";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/ui/atoms/Logo/Logo";
import { Link } from "@/i18n/navigation";
import { BackButton } from "./BackButton";
import styles from "./notFoundPage.module.scss";

/**
 * Full-page 404 — rendered by `app/[locale]/not-found.tsx` for any URL that
 * matches no route. Stands alone rather than inside `AppShell`: `notFound()`
 * thrown from a layout (e.g. an unknown workspace/project) skips that
 * layout's own render, so there's no sidebar to sit next to anyway — "back"
 * and "home" cover getting out again.
 *
 * `home` always points at `/`: `app/[locale]/page.tsx` already resolves
 * signed-in vs. signed-out vs. no-workspace-yet, so this page doesn't need
 * to know which one applies.
 */
export async function NotFoundPage() {
  const t = await getTranslations("notFound");

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <Logo
          variant="mark"
          color="color"
          height={36}
          className={styles.logo}
        />

        <p className={styles.code} aria-hidden="true">
          404
        </p>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.description}>{t("description")}</p>

        <div className={styles.actions}>
          <Link href="/" className={styles.primary}>
            <Icon icon="lucide:house" width={16} />
            {t("home")}
          </Link>
          <BackButton label={t("back")} />
        </div>
      </div>
    </div>
  );
}
