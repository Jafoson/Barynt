"use client";

import { Icon } from "@iconify/react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { Button } from "@/components/ui/atoms/Button/Button";
import buttonStyles from "@/components/ui/atoms/Button/button.module.scss";
import { Label } from "@/components/ui/atoms/Label/Label";
import { ActivityFeed } from "@/features/audit/components/ActivityFeed/ActivityFeed";
import type { ActivityView } from "@/features/audit/queries";
import type {
  DashboardStats,
  ProjectProfile,
} from "@/features/dashboard/types";
import { useOpenLabelModal } from "@/features/issues/useOpenLabelModal";
import { Link, useRouter } from "@/i18n/navigation";
import { roleColor } from "@/lib/rbac";
import { fullName } from "@/lib/utils/string";
import styles from "./projectProfileView.module.scss";

interface Props {
  /** Name, color, and id are used in the header card, or needed by the label dialog. */
  project: {
    id: string;
    name: string;
    color: string;
    avatarUrl: string | null;
  };
  workspaceId: string;
  profile: ProjectProfile;
  stats: DashboardStats;
  /** Addresses of the neighboring areas — the tile row below links to them. */
  links: {
    board: string;
    list: string;
    members: string;
    settings: string;
    /** Team management lives one level up — teams belong to the workspace. */
    teams: string;
    /** The full, filterable list — the card below shows only an excerpt. */
    activity: string;
  };
  /** Excerpt of the activity log — without `audit.view` already filtered to
   * your own entries (`getProjectActivity`). */
  activity: ActivityView;
}

interface CardProps {
  title: string;
  /** Number next to the heading, where the card shows a list. */
  count?: number;
  /**
   * Nothing inside. The card then switches from the filled to the dashed
   * form — it says "there's room here" instead of "something's missing
   * here". A gray sentence in an otherwise normal box reads like a loading
   * error.
   */
  empty?: boolean;
  /** Dashed border regardless of content — for list cards that should
   * always look this way, not only when empty (as in the workspace
   * profile card). */
  dashed?: boolean;
  /**
   * For the members card: the content scrolls within itself instead of
   * stretching the card (and with it the whole page) arbitrarily long — with
   * many members, the title and "all members" stay reachable this way,
   * without having to scroll past them first.
   */
  scrollBody?: boolean;
  /**
   * For the activity card: it claims whatever space is left over in `.main`
   * after the header card, key facts, and teams/labels, instead of growing
   * with its content — exactly the role `align-items: stretch` in `.side`
   * already handles automatically for the members card. But `.main` is a
   * flex column with no externally determined height, hence explicit here.
   * Only makes sense together with `scrollBody`: otherwise the card itself
   * would just keep growing with its content.
   */
  grow?: boolean;
  /** Button top-right next to title and count, e.g. to create or manage. */
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

function Card({
  title,
  count,
  empty,
  dashed,
  scrollBody,
  grow,
  action,
  footer,
  children,
}: CardProps) {
  const content = (
    <>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>
          {title}
          {count !== undefined && <span className={styles.count}>{count}</span>}
        </h3>
        {action}
      </div>
      <div className={styles.cardBody}>{children}</div>
      {footer}
    </>
  );

  return (
    <section
      className={styles.card}
      data-empty={empty || undefined}
      data-dashed={dashed || undefined}
      data-scroll={scrollBody || undefined}
      data-grow={grow || undefined}
    >
      {/* Scrolls as a whole (header, list, footer) instead of just the rows
          in between — otherwise the scrollbar wouldn't cover the card's
          full height. Header and footer still stay in place:
          `position: sticky`, see `.card[data-scroll] .cardHead`/`.cardLink`
          in the stylesheet. */}
      {scrollBody ? (
        <div className={styles.cardScroll}>{content}</div>
      ) : (
        content
      )}
    </section>
  );
}

/**
 * The project's profile card: what it is, who owns it, what it consists of.
 *
 * The counterpart view to the dashboard, and deliberately a different kind
 * of information. The dashboard answers "how's it doing right now" and
 * changes hourly; this shows what still holds next month too — purpose,
 * prefix, leadership, access. That's why this view has no time period
 * either: a prefix doesn't have 30 days.
 *
 * ── Four tiers, four presentations ──
 *
 * Six identical-looking boxes stacked up aren't an overview, they're a list
 * where everything looks equally important. So the page tiers instead:
 *
 *   1. Who am I: the **header card** with the project's icon, its name, and
 *      its purpose — larger radius, more padding, the entry point.
 *   2. The key facts as **one bordered strip** with dividers. Four separate
 *      boxes would be four things; but it's one row of metadata.
 *   3. Who and what as **filled cards** sharing the width. Whatever's empty
 *      turns dashed instead of filled.
 *   4. The ways out as **bordered tiles** at the very bottom — they lead
 *      away from this page and therefore belong at the end, not in between.
 *
 * It isn't customizable. A profile card with toggleable fields wouldn't be
 * a profile card anymore — you look one up precisely because it always
 * contains the same thing.
 */
export function ProjectProfileView({
  project,
  workspaceId,
  profile,
  stats,
  links,
  activity,
}: Props) {
  const t = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const openLabelModal = useOpenLabelModal();

  const openNewLabel = () =>
    openLabelModal({
      workspaceId,
      projectId: project.id,
      onDone: () => router.refresh(),
    });
  const created = format.dateTime(new Date(profile.createdAt), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const isPrivate = profile.visibility === "private";

  const facts = [
    {
      key: "prefix",
      icon: "lucide:hash",
      label: t("fields.prefix"),
      // The prefix in the same font it also appears in on the issues.
      value: <code className={styles.mono}>{profile.prefix}</code>,
    },
    {
      key: "visibility",
      icon: isPrivate ? "lucide:lock" : "lucide:globe",
      label: t("projectSettings.visibility"),
      value: t(
        isPrivate ? "projectSettings.private" : "projectSettings.public",
      ),
    },
    {
      key: "created",
      icon: "lucide:calendar",
      label: t("fields.created"),
      value: created,
      // Who created it appears small underneath instead of in the same
      // sentence: the date is the information, the name its footnote.
      meta: profile.createdBy ? fullName(profile.createdBy) : undefined,
    },
    {
      key: "issues",
      icon: "lucide:circle-dot",
      label: t("dashboard.issues"),
      value: t("dashboard.issuesOpen", { count: stats.open }),
      meta: t("dashboard.issuesTotal", { count: stats.total }),
    },
  ];

  // Icon and label are the same as in the sidebar (`PROJECT_NAV`) — an
  // area shouldn't depend on which door you enter through. The page builds
  // the addresses, because only it knows the workspace.
  //
  // Without canViewSettings, this tile would otherwise remain the only door
  // to settings, even though the same tab in the sidebar (`PROJECT_NAV`) is
  // already hidden.
  const shortcuts = (
    [
      { key: "board", icon: "lucide:square-kanban", href: links.board },
      { key: "issues", icon: "lucide:list", href: links.list },
      { key: "members", icon: "lucide:users", href: links.members },
      { key: "settings", icon: "lucide:settings", href: links.settings },
    ] as const
  ).filter((s) => s.key !== "settings" || profile.canViewSettings);

  // Two ways to show a role — the groups arrive pre-sorted from the
  // server, here they're just split into who's called out individually and
  // who appears in the list.
  const named = profile.roles.filter((role) => role.distinguished);
  const rest = profile.roles.filter((role) => !role.distinguished);

  return (
    <div className={styles.page}>
      {/* Everything that describes the project itself sits in one column —
          first who it is, then its key facts, then what it's worked with.
          The members sit next to it (`.side`) and read as their own column;
          in the document they come after, so the eye and a screen reader
          get the same order. */}
      <div className={styles.main}>
        {/* ── 1. Who am I ── */}
        <header className={styles.hero}>
          {/* The same icon the app uses to represent the project everywhere
            — just large. `Avatar` brings shape, rounding, and the text
            color that matches the project color; rebuilding that would be
            a second calculation that would silently go wrong for a light
            color. */}
          <Avatar
            avatar={{
              name: project.name,
              color: project.color,
              image: project.avatarUrl ?? undefined,
            }}
            shape="square"
            size={92}
          />

          <div className={styles.heroText}>
            <h2 className={styles.heroName}>{project.name}</h2>
            {profile.desc ? (
              <p className={styles.desc}>{profile.desc}</p>
            ) : (
              profile.canUpdate && (
                // Only the placeholder, no second way to change it: that
                // already exists as "edit" at the right edge of the same
                // card. Without this permission there's no button there —
                // the placeholder would then invite an action that doesn't
                // exist, so it's left out and only the name is shown.
                <p className={styles.descEmpty}>
                  {t("dashboard.noDescription")}
                </p>
              )
            )}
          </div>

          {/* A link, not a button: settings has its own address, and a
              link can be opened in a new tab. Looks like a button, behaves
              like a link. */}
          {profile.canUpdate && (
            <Link href={links.settings} className={styles.heroEdit}>
              <Icon icon="lucide:pencil" width={14} />
              {t("actions.edit")}
            </Link>
          )}
        </header>

        {/* ── 2. The key facts ── */}
        <dl className={styles.facts}>
          {facts.map((fact) => (
            <div key={fact.key} className={styles.fact}>
              <dt className={styles.factLabel}>
                <Icon icon={fact.icon} width={13} />
                {fact.label}
              </dt>
              <dd className={styles.factValue}>
                {fact.value}
                {fact.meta && (
                  <span className={styles.factMeta}>{fact.meta}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        {/* ── 3. Who, and with what ── */}
        <div className={styles.columns}>
          <Card
            title={t("nav.teams")}
            count={profile.teams.length}
            empty={profile.teams.length === 0}
            dashed
            action={
              // Teams belong to the workspace — they're managed there, not
              // in the project. The arrow reflects that: it leads away,
              // but it isn't a create button like the one for labels.
              profile.canManageTeams && (
                <Link
                  href={links.teams}
                  className={[
                    buttonStyles.btn,
                    buttonStyles.text,
                    buttonStyles.sm,
                    buttonStyles.iconOnly,
                  ].join(" ")}
                  aria-label={t("actions.edit")}
                  title={t("actions.edit")}
                >
                  <Icon icon="lucide:arrow-right" width={15} />
                </Link>
              )
            }
          >
            {profile.teams.length === 0 ? (
              t("dashboard.noTeams")
            ) : (
              <ul className={styles.rows}>
                {profile.teams.map((team) => (
                  <li key={team.id}>
                    <span className={styles.row}>
                      <span
                        className={styles.teamKey}
                        style={{ background: team.color }}
                      >
                        {team.key}
                      </span>
                      {team.name}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title={t("nav.labels")}
            count={profile.labels.length}
            empty={profile.labels.length === 0}
            dashed
            action={
              profile.canCreateLabel && (
                <Button
                  variant="text"
                  size="sm"
                  icon={<Icon icon="lucide:plus" width={15} />}
                  aria-label={t("projectLabels.newLabel")}
                  title={t("projectLabels.newLabel")}
                  onClick={openNewLabel}
                />
              )
            }
          >
            {profile.labels.length === 0 ? (
              t("dashboard.noLabels")
            ) : (
              <ul className={styles.rows}>
                {profile.labels.map((label) => (
                  <li key={label.id}>
                    {/* A click filters the board to exactly this label —
                        the same convention as everywhere: the URL carries
                        the slug, not the id (`lib/filter-slugs.ts`). The
                        same own/shared distinction as in the label settings
                        still appears in the title tooltip. */}
                    <Link
                      href={`${links.board}?label=${label.slug}`}
                      className={`${styles.row} ${styles.rowLink}`}
                      title={t(
                        label.own
                          ? "dashboard.labelOwn"
                          : "dashboard.labelShared",
                      )}
                    >
                      <span
                        className={styles.labelDot}
                        style={{ background: label.color }}
                        aria-hidden="true"
                      />
                      {label.name}
                      <Icon
                        icon="lucide:arrow-right"
                        width={13}
                        className={styles.rowArrow}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ── Activity ── Who did what and when: members, issues, labels.
            Always visible, but without `audit.view` already filtered
            server-side to your own entries (`getProjectActivity`) — no
            permission gate here, just a different excerpt. */}
        <Card
          title={t("nav.activity")}
          count={activity.entries.length}
          empty={activity.entries.length === 0}
          scrollBody
          grow
          footer={
            activity.canViewAll &&
            activity.entries.length > 0 && (
              <Link href={links.activity} className={styles.cardLink}>
                {t("dashboard.allActivity")}
                <Icon icon="lucide:arrow-right" width={13} />
              </Link>
            )
          }
        >
          {activity.entries.length === 0 ? (
            t("dashboard.noActivity")
          ) : (
            <ActivityFeed
              entries={activity.entries}
              workspaceSlug={workspaceId}
            />
          )}
        </Card>
      </div>

      {/* Members as their own column on the right. */}
      <aside className={styles.side}>
        <Card
          title={t("nav.members")}
          count={profile.memberCount}
          empty={profile.memberCount === 0}
          scrollBody
          footer={
            profile.memberCount > 0 && (
              <Link href={links.members} className={styles.cardLink}>
                {t("dashboard.allMembers")}
                <Icon icon="lucide:arrow-right" width={13} />
              </Link>
            )
          }
        >
          {profile.memberCount === 0 ? (
            t("dashboard.noMembers")
          ) : (
            <>
              {/* Anyone carrying more than just contributor status appears
                  individually: avatar, name, address — and the chip with
                  their role's name. It sits next to the name and not at
                  the right edge of the card: it says something about
                  *this* person, and across half a card's width of distance
                  the connection would have to be searched for. */}
              {named.length > 0 && (
                <ul className={styles.people}>
                  {named.flatMap((role) =>
                    role.members.map((member) => (
                      <li key={member.id} className={styles.person}>
                        <Avatar avatar={member} size={28} />
                        <span className={styles.personText}>
                          <span className={styles.personName}>
                            <span>{fullName(member)}</span>
                            <Label
                              size="sm"
                              filled
                              color={roleColor(role.rank)}
                            >
                              {role.name}
                            </Label>
                          </span>
                          {member.email && (
                            <span className={styles.personMeta}>
                              {member.email}
                            </span>
                          )}
                        </span>
                      </li>
                    )),
                  )}
                </ul>
              )}

              {/* All remaining ones per role as a vertical list. The
                  heading carries the role name and makes a chip per row
                  unnecessary — ten instances of "Contributor" stacked up
                  would be a column of the same word. */}
              {rest.map((role) => (
                <div key={role.key} className={styles.roleBlock}>
                  <span className={styles.subLabel}>
                    {role.name}
                    <span className={styles.count}>{role.members.length}</span>
                  </span>
                  <ul className={styles.roster}>
                    {role.members.map((member) => (
                      <li key={member.id} className={styles.rosterRow}>
                        <Avatar avatar={member} size={22} />
                        <span className={styles.rosterName}>
                          {fullName(member)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          )}
        </Card>
      </aside>

      {/* ── 4. The ways out ── */}
      <nav className={styles.next} aria-label={t("dashboard.goOn")}>
        <span className={styles.subLabel}>{t("dashboard.goOn")}</span>
        <ul className={styles.tiles}>
          {shortcuts.map((shortcut) => (
            <li key={shortcut.key}>
              <Link href={shortcut.href} className={styles.tile}>
                <Icon
                  icon={shortcut.icon}
                  width={16}
                  className={styles.tileIcon}
                />
                {t(`nav.${shortcut.key}`)}
                <Icon
                  icon="lucide:arrow-right"
                  width={14}
                  className={styles.tileArrow}
                />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
