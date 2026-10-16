"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import type { CSSProperties, ReactNode } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { Button } from "@/components/ui/atoms/Button/Button";
import type { WidgetData } from "@/features/dashboard/types";
import { useOpenLabelModal } from "@/features/issues/useOpenLabelModal";
import { Link, useRouter } from "@/i18n/navigation";
import { fullName } from "@/lib/utils/string";
import styles from "../widget.module.scss";

type Data = Extract<
  WidgetData,
  { type: "members" | "teams" | "labels" | "projects" | "links" | "shortcuts" }
>;

/** What the old overview page showed — people, teams, labels, projects,
 *  links and the way to the neighboring areas — as widgets. Every row is a
 *  way somewhere: a person, a label or a team opens its open issues, a
 *  project its dashboard. */
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

/** One row of a list: a leading mark, a name with a line below, a count,
 *  and an arrow on hover. The whole row is the link. */
function Row({
  href,
  lead,
  name,
  sub,
  end,
  title,
}: {
  href: string | null;
  lead: ReactNode;
  name: ReactNode;
  sub?: ReactNode;
  end?: ReactNode;
  title?: string;
}) {
  const body = (
    <>
      <span className={styles.rowLead}>{lead}</span>
      <span className={styles.rowMain}>
        <span className={styles.rowName}>{name}</span>
        {sub && <span className={styles.rowSub}>{sub}</span>}
      </span>
      {end}
      {href && (
        <Icon icon="lucide:chevron-right" width={15} className={styles.rowGo} />
      )}
    </>
  );
  return href ? (
    <Link href={href} className={styles.item} title={title}>
      {body}
    </Link>
  ) : (
    <div className={styles.item} title={title}>
      {body}
    </div>
  );
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <span
      className={styles.count}
      data-zero={value === 0 || undefined}
      title={label}
    >
      {value}
    </span>
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
      {/* Medium: a row of faces and how many. */}
      <div className={`${styles.faces} ${styles.onlyShort}`}>
        <div className={styles.stack}>
          {everyone.slice(0, 8).map((m) => (
            <Avatar key={m.user.id} avatar={m.user} size={28} />
          ))}
        </div>
        <span className={styles.sub}>
          {t("memberCount", { count: data.total })}
        </span>
      </div>

      {/* Large and tall: the roster, by role, every person a link to their
          open issues. */}
      <div className={`${styles.list} ${styles.scrollList} ${styles.noShort}`}>
        {data.groups.map((group) => (
          <section key={group.key} className={styles.section}>
            <h4 className={styles.sectionHead}>
              {group.name}
              <span>{group.members.length}</span>
            </h4>
            {group.members.map((m) => (
              <Row
                key={m.user.id}
                href={m.href}
                title={t("openIssuesOf", { name: fullName(m.user) })}
                lead={<Avatar avatar={m.user} size={28} />}
                name={fullName(m.user)}
                sub={m.user.handle ? `@${m.user.handle}` : undefined}
              />
            ))}
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
      <div className={`${styles.list} ${styles.scrollList} ${styles.noS}`}>
        {data.teams.map((team) => (
          <Row
            key={team.id}
            href={team.href}
            title={t("openIssuesOf", { name: team.name })}
            lead={
              <span
                className={styles.teamKey}
                style={{ "--c": team.color } as CSSProperties}
              >
                {team.key}
              </span>
            }
            name={team.name}
            sub={
              team.lead
                ? t("teamSub", {
                    count: team.members,
                    lead: team.lead.firstName || team.lead.lastName,
                  })
                : t("memberCount", { count: team.members })
            }
            end={
              <span className={`${styles.stack} ${styles.rowFaces}`}>
                {team.people.slice(0, 4).map((user) => (
                  <Avatar key={user.id} avatar={user} size={20} />
                ))}
              </span>
            }
          />
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
        <>
          {/* Medium: chips. */}
          <div className={`${styles.chips} ${styles.onlyShort}`}>
            {data.labels.map((label) => (
              <Link
                key={label.id}
                href={label.href}
                className={styles.chip}
                style={{ "--c": label.color } as CSSProperties}
              >
                <i />
                {label.name}
                {label.open > 0 && <b>{label.open}</b>}
              </Link>
            ))}
          </div>
          {/* Large and tall: a list. */}
          <div
            className={`${styles.list} ${styles.scrollList} ${styles.noShort}`}
          >
            {data.labels.map((label) => (
              <Row
                key={label.id}
                href={label.href}
                title={t("openIssuesOf", { name: label.name })}
                lead={
                  <span
                    className={styles.labelMark}
                    style={{ "--c": label.color } as CSSProperties}
                  />
                }
                name={label.name}
                sub={label.own ? t("labelOwn") : t("labelShared")}
                end={
                  <Count
                    value={label.open}
                    label={t("openCount", { count: label.open })}
                  />
                }
              />
            ))}
          </div>
        </>
      )}
      <div className={styles.footRow}>
        {data.canCreate && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon icon="lucide:plus" width={14} />}
            onClick={() =>
              openLabel({
                workspaceId: data.workspaceId,
                projectId: data.projectId,
                onDone: () => router.refresh(),
              })
            }
          >
            {t("newLabel")}
          </Button>
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
      <div className={`${styles.tiles} ${styles.scrollList}`}>
        {data.projects.map((project) => (
          <Row
            key={project.id}
            href={project.href}
            lead={
              <Avatar
                avatar={{
                  name: project.name,
                  color: project.color,
                  ...(project.avatarUrl ? { image: project.avatarUrl } : {}),
                }}
                size={28}
                shape="square"
              />
            }
            name={project.name}
            sub={project.prefix}
            end={
              <Count
                value={project.open}
                label={t("openCount", { count: project.open })}
              />
            }
          />
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
