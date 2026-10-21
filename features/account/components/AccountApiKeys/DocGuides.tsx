"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import { useModal } from "@/lib/context";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import {
  AUTH_DOC_EXAMPLE,
  AUTH_DOC_INTRO,
  AUTH_DOC_MCP,
  AUTH_DOC_RATE,
  AUTH_DOC_SCOPES,
  PAGING_DOC_EXAMPLE,
  PAGING_DOC_FIELDS,
  PAGING_DOC_FIELDS_EXAMPLE,
  PAGING_DOC_INTRO,
  PAGING_DOC_PARAMS,
} from "./basicsDocsData";
import styles from "./docGuides.module.scss";
import { useDocText } from "./docText";
import { FilterDocs } from "./FilterDocs";
import { GuideCard, GuideRows, GuideSplit } from "./GuideParts";
import { WebhookDocs } from "./WebhookDocs";

export type DocGuideId = "auth" | "paging" | "filter" | "webhooks";

const GUIDE_ICON: Record<DocGuideId, string> = {
  auth: "lucide:key-round",
  paging: "lucide:list-ordered",
  filter: "lucide:filter",
  webhooks: "lucide:webhook",
};

/**
 * "Basics" above the endpoint tabs (BARY-172): what applies across
 * endpoints — signing in, paging, the filter tree — each a card that opens
 * its guide. A dialog from a tablet up, a sheet on a phone. The endpoint
 * tabs stay for endpoints.
 */
export function DocGuides({ guides }: { guides: DocGuideId[] }) {
  const t = useTranslations();
  const { openModal } = useModal();
  const isPhone = useMediaQuery(PHONE_QUERY);

  const titles: Record<DocGuideId, { title: string; desc: string }> = {
    auth: { title: t("apiKeys.guideAuth"), desc: t("apiKeys.guideAuthDesc") },
    paging: {
      title: t("apiKeys.guidePaging"),
      desc: t("apiKeys.guidePagingDesc"),
    },
    filter: {
      title: t("apiKeys.guideFilter"),
      desc: t("apiKeys.guideFilterDesc"),
    },
    webhooks: {
      title: t("apiKeys.guideWebhooks"),
      desc: t("apiKeys.guideWebhooksDesc"),
    },
  };

  const open = (id: DocGuideId) =>
    openModal(
      ({ close }) => (
        <GuideModal
          id={id}
          title={titles[id].title}
          close={close}
          sheet={isPhone}
        />
      ),
      isPhone ? { placement: "bottom" } : undefined,
    );

  return (
    <div className={styles.basics}>
      <span className={styles.basicsTitle}>{t("apiKeys.guidesTitle")}</span>
      <div className={styles.guideCards}>
        {guides.map((id) => (
          <button
            key={id}
            type="button"
            className={styles.guideCard}
            onClick={() => open(id)}
          >
            <span className={styles.guideIcon}>
              <Icon icon={GUIDE_ICON[id]} width={16} />
            </span>
            <span className={styles.guideText}>
              {titles[id].title}
              <small>{titles[id].desc}</small>
            </span>
            <Icon
              icon="lucide:chevron-right"
              width={16}
              className={styles.guideChevron}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function GuideModal({
  id,
  title,
  close,
  sheet,
}: {
  id: DocGuideId;
  title: string;
  close: () => void;
  sheet: boolean;
}) {
  const t = useTranslations();
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);
  return (
    <Modal
      width={960}
      variant={sheet ? "sheet" : "dialog"}
      style={sheet ? swipe.style : undefined}
      {...(sheet ? swipe.handlers : {})}
    >
      {sheet ? (
        <SheetHeader
          title={title}
          onClose={close}
          closeLabel={t("actions.close")}
        />
      ) : (
        <ModalHeader
          title={title}
          leading={<Icon icon={GUIDE_ICON[id]} width={16} />}
          onClose={close}
          closeLabel={t("actions.close")}
        />
      )}
      <ModalBody ref={bodyRef} className={styles.modalBody}>
        {id === "auth" ? (
          <AuthGuide />
        ) : id === "paging" ? (
          <PagingGuide />
        ) : id === "webhooks" ? (
          <WebhookDocs />
        ) : (
          <FilterDocs />
        )}
      </ModalBody>
    </Modal>
  );
}

function AuthGuide() {
  const t = useTranslations();
  const doc = useDocText();
  return (
    <div className={styles.root}>
      <GuideCard title={t("apiKeys.guideAuthKey")}>
        <GuideSplit lines={AUTH_DOC_INTRO} code={AUTH_DOC_EXAMPLE} />
      </GuideCard>
      <GuideCard title={t("apiKeys.guideAuthScopes")}>
        <ul className={styles.pitfalls}>
          {AUTH_DOC_SCOPES.map((line) => (
            <li key={doc(line)}>{doc(line)}</li>
          ))}
        </ul>
      </GuideCard>
      <GuideCard title={t("apiKeys.guideAuthRate")}>
        <GuideRows rows={AUTH_DOC_RATE} />
      </GuideCard>
      <p className={styles.footnote}>{doc(AUTH_DOC_MCP)}</p>
    </div>
  );
}

function PagingGuide() {
  const t = useTranslations();
  return (
    <div className={styles.root}>
      <GuideCard title={t("apiKeys.guidePagingHow")}>
        <GuideSplit lines={PAGING_DOC_INTRO} code={PAGING_DOC_EXAMPLE} />
        <GuideRows rows={PAGING_DOC_PARAMS} />
      </GuideCard>
      <GuideCard title={t("apiKeys.guidePagingFields")}>
        <GuideSplit
          lines={PAGING_DOC_FIELDS}
          code={PAGING_DOC_FIELDS_EXAMPLE}
        />
      </GuideCard>
    </div>
  );
}
