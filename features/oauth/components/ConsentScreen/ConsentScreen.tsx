import { Icon } from "@iconify/react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Logo } from "@/components/ui/atoms/Logo/Logo";
import {
  approveOAuthConsent,
  denyOAuthConsent,
} from "@/features/oauth/actions";
import styles from "./consentScreen.module.scss";

interface ConsentScreenProps {
  title: string;
  signedInAsLabel: string;
  wantsAccessLabel: string;
  scopesIntroLabel: string;
  allowLabel: string;
  denyLabel: string;
  scopeDescriptions: string[];
  hiddenFields: Record<string, string | undefined>;
}

/**
 * The one screen a human ever sees in the whole OAuth flow — everything
 * before it (discovery, dynamic client registration) and after it (token
 * exchange) is machine-to-machine. Both buttons are separate forms posting
 * to separate server actions (`features/oauth/actions.ts`) rather than one
 * form with two submit buttons: keeps "which action ran" unambiguous
 * without inspecting which submitter fired, and each action re-validates
 * the OAuth request independently before doing anything with it.
 */
export function ConsentScreen({
  title,
  signedInAsLabel,
  wantsAccessLabel,
  scopesIntroLabel,
  allowLabel,
  denyLabel,
  scopeDescriptions,
  hiddenFields,
}: ConsentScreenProps) {
  const hidden = Object.entries(hiddenFields).filter(
    ([, v]) => v !== undefined,
  );

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Logo variant="horizontal" color="color" height={32} priority />

        <h1 className={styles.title}>{title}</h1>
        <p className={styles.wants}>{wantsAccessLabel}</p>
        <p className={styles.signedInAs}>{signedInAsLabel}</p>

        {scopeDescriptions.length > 0 && (
          <div className={styles.scopes}>
            <p className={styles.scopesIntro}>{scopesIntroLabel}</p>
            <ul className={styles.scopeList}>
              {scopeDescriptions.map((desc) => (
                <li key={desc}>
                  <Icon icon="lucide:check" width={16} />
                  {desc}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.actions}>
          <form action={denyOAuthConsent}>
            {hidden.map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <Button type="submit" variant="outline" size="lg" full>
              {denyLabel}
            </Button>
          </form>
          <form action={approveOAuthConsent}>
            {hidden.map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <Button type="submit" variant="primary" size="lg" full>
              {allowLabel}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
