"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import type { WidgetData } from "@/features/dashboard/types";
import { useOpenLabelModal } from "@/features/issues/useOpenLabelModal";
import { Link, useRouter } from "@/i18n/navigation";
import styles from "../widget.module.scss";

type Data = Extract<
  WidgetData,
  { type: "members" | "teams" | "labels" | "projects" | "links" | "shortcuts" }
>;

/** What the old overview page showed — people, teams, labels, projects,
 *  links and the way to the neighboring areas — as widgets. */
export function TeamBody({ data }: { data: Data }) {
  switch (data.type) {
    case "members":
      return <Members data={data} />;
    case "teams":
      return <Teams data={data} />;
    case "labels":
      return <Labels data={data} />;
    case "projects":
      return <Projects data={data} />;
    case "links":
      return <Links data={data} />;
    case "shortcuts":
      return <Shortcuts data={data} />;
  }
}

/** "All members →" at the widget's foot. */
function More({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;
  return (
    <Link href={href} className={`${styles.more} ${styles.noS}`}>
      {label}
      <Icon icon="lucide:arrow-right" width={13} />
    </Link>
  );
}

function Members({ data }: { data: Extract<Data, { type: "members" }> }) {
  const t = useTranslations("widgets");
  const everyone = data.groups.flatMap((g) => g.members);
  if (everyone.length === 0) {
    return <div className={styles.empty}>{t("noMembers")}</div>;
  }
  return (
    <>
      {/* Short: a row of faces and how many. */}
      <div className={`${styles.faces} ${styles.onlyShort}`}>
        <div className={styles.stack}>
          {everyone.slice(0, 8).map((user) => (
            <Avatar key={user.id} avatar={user} size={28} />
          ))}
        </div>
        <span className={styles.sub}>
          {t("memberCount", { count: data.total })}
        </span>
      </div>
      <div className={`${styles.groups} ${styles.noShort}`}>
        {data.groups.map((group) => (
          <section key={group.key} className={styles.roleGroup}>
            <h4>
              {group.name} <span>{group.members.length}</span>
            </h4>
            <div className={styles.people}>
              {group.members.map((user) => (
                <span key={user.id} className={styles.person}>
                  <Avatar avatar={user} size={20} />
                  <span>{user.firstName || user.lastName || user.handle}</span>
                </span>
              ))}
            </div>
          </section>
        ))}
      </div>
      <More href={data.href} label={t("allMembers")} />
    </>
  );
}

function Teams({ data }: { data: Extract<Data, { type: "teams" }> }) {
  const t = useTranslations("widgets");
  if (data.teams.length === 0) {
    return <div className={styles.empty}>{t("noTeams")}</div>;
  }
  return (
    <>
      <div className={`${styles.kpi} ${styles.onlyS}`}>
        <div>
          <div className={styles.big}>{data.teams.length}</div>
          <div className={styles.sub}>
            {t("teamCount", { count: data.teams.length })}
          </div>
        </div>
      </div>
      <div className={`${styles.rows} ${styles.noS}`}>
        {data.teams.map((team) => (
          <div key={team.id} className={styles.entity}>
            <span
              className={styles.teamKey}
              style={{ "--c": team.color } as CSSProperties}
            >
              {team.key}
            </span>
            <span className={styles.name}>{team.name}</span>
            <span className={styles.pill}>
              {t("memberCount", { count: team.members })}
            </span>
            {team.lead && (
              <span className={styles.noShort} title={t("lead")}>
                <Avatar avatar={team.lead} size={20} />
              </span>
            )}
          </div>
        ))}
      </div>
      <More href={data.href} label={t("allTeams")} />
    </>
  );
}

function Labels({ data }: { data: Extract<Data, { type: "labels" }> }) {
  const t = useTranslations("widgets");
  const router = useRouter();
  const openLabel = useOpenLabelModal();
  return (
    <>
      {data.labels.length === 0 ? (
        <div className={styles.empty}>{t("noLabels")}</div>
      ) : (
        <div className={styles.chips}>
          {data.labels.map((label) => (
            <span
              key={label.id}
              className={styles.chip}
              style={{ "--c": label.color } as CSSProperties}
              title={label.own ? t("labelOwn") : t("labelShared")}
            >
              <i />
              {label.name}
              {label.open > 0 && <b>{label.open}</b>}
            </span>
          ))}
        </div>
      )}
      <div className={styles.footRow}>
        {data.canCreate && (
          <button
            type="button"
            className={styles.footButton}
            onClick={() =>
              openLabel({
                workspaceId: data.workspaceId,
                projectId: data.projectId,
                onDone: () => router.refresh(),
              })
            }
          >
            <Icon icon="lucide:plus" width={13} />
            {t("newLabel")}
          </button>
        )}
        <More href={data.href} label={t("manage")} />
      </div>
    </>
  );
}

function Projects({ data }: { data: Extract<Data, { type: "projects" }> }) {
  const t = useTranslations("widgets");
  if (data.projects.length === 0) {
    return <div className={styles.empty}>{t("noProjects")}</div>;
  }
  return (
    <>
      <div className={styles.tiles}>
        {data.projects.map((project) => (
          <Link key={project.id} href={project.href} className={styles.entity}>
            <Avatar
              avatar={{
                name: project.name,
                color: project.color,
                ...(project.avatarUrl ? { image: project.avatarUrl } : {}),
              }}
              size={22}
              shape="square"
            />
            <span className={styles.name}>
              {project.name}
              <span className={styles.ref}> {project.prefix}</span>
            </span>
            <span className={styles.pill}>
              {t("openCount", { count: project.open })}
            </span>
          </Link>
        ))}
      </div>
      <More href={data.href} label={t("allProjects")} />
    </>
  );
}

function Links({ data }: { data: Extract<Data, { type: "links" }> }) {
  const t = useTranslations("widgets");
  return (
    <>
      {data.links.length === 0 ? (
        <div className={styles.empty}>{t("noLinks")}</div>
      ) : (
        <div className={styles.chips}>
          {data.links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className={styles.chip}
            >
              <Icon icon="lucide:external-link" width={12} />
              {link.label}
            </a>
          ))}
        </div>
      )}
      <More href={data.href} label={t("manage")} />
    </>
  );
}

function Shortcuts({ data }: { data: Extract<Data, { type: "shortcuts" }> }) {
  const t = useTranslations("widgets");
  return (
    <nav className={styles.shortcuts} aria-label={t("type_shortcuts")}>
      {data.items.map((item) => (
        <Link key={item.key} href={item.href} className={styles.shortcut}>
          <Icon icon={item.icon} width={18} />
          <span>{t(`shortcut_${item.key}`)}</span>
        </Link>
      ))}
    </nav>
  );
}
