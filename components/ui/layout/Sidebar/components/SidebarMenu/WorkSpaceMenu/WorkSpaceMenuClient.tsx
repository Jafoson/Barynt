"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { Button } from "@/components/ui/atoms/Button/Button";
import { EmptyState } from "@/components/ui/atoms/EmptyState/EmptyState";
import { Popover } from "@/components/ui/atoms/Popover/Popover";
import { useRouter } from "@/i18n/navigation";
import type { Workspace } from "@/types";
import styles from "../SidebarMenu.module.scss";

interface WorkspaceMenuProps {
  workspace: Workspace;
  userWorkspaces: Workspace[];
  /** Off when an admin has disabled workspace creation platform-wide
   *  (`lib/system-settings.ts`) — hides the "New workspace" entry instead of
   *  offering a button that would just bounce back. */
  canCreateWorkspace: boolean;
}

export function WorkspaceMenuClient({
  workspace,
  userWorkspaces,
  canCreateWorkspace,
}: WorkspaceMenuProps) {
  const t = useTranslations("nav");
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  function goTo(wsId: string) {
    setOpen(false);
    router.push(`/${wsId}`);
  }

  // Extracted so the empty state below can reuse it as its call to action
  // instead of duplicating the button.
  const newWorkspaceButton = canCreateWorkspace ? (
    <Button
      variant="elevated"
      full
      onClick={() => {
        setOpen(false);
        router.push("/create-workspace");
      }}
    >
      <Icon icon="lucide:plus" width={16} />
      {t("newWorkspace")}
    </Button>
  ) : null;

  return (
    <div ref={ref}>
      <Button
        variant="ghost"
        size="lg"
        className={styles.trigger}
        onClick={() => setOpen(!open)}
        style={{ gap: 6, padding: "4px 8px", width: "100%" }}
      >
        <Avatar
          avatar={{
            name: workspace.name,
            color: workspace.color,
            image: workspace.avatarUrl ?? undefined,
          }}
          size={30}
        />
        <span className={styles.title}>{workspace.name}</span>
        <Icon
          icon="lucide:chevrons-up-down"
          width={16}
          className={styles.icon}
        />
      </Button>

      <Popover
        anchorRef={ref}
        open={open}
        onClose={() => setOpen(false)}
        width={210}
      >
        <div className={styles.label}>Workspace</div>

        {userWorkspaces.length > 0 ? (
          <>
            {userWorkspaces.map((ws) => (
              <Button
                key={ws.id}
                variant="ghost"
                full
                textAlign="left"
                // Same marking as in every other dropdown/menu (`NavLink`,
                // `ScopePicker`, `RangePicker`): `data-active` instead of a
                // custom class, so the active entry looks the same here as
                // everywhere else.
                data-active={ws.id === workspace.id ? "true" : undefined}
                onClick={() => goTo(ws.id)}
              >
                <Avatar
                  avatar={{
                    name: ws.name,
                    color: ws.color,
                    image: ws.avatarUrl ?? undefined,
                  }}
                />
                {ws.name}
              </Button>
            ))}

            {newWorkspaceButton && (
              <>
                <div className="divider" style={{ margin: "5px 0" }} />
                {newWorkspaceButton}
              </>
            )}
          </>
        ) : (
          // Not a membership anywhere (or a project guest viewing this
          // workspace without one, see index.tsx) — an empty list here used
          // to be a silent dead end with nothing below the label.
          <EmptyState
            icon={<Icon icon="lucide:building-2" width={24} />}
            title={t("noWorkspaces")}
            description={
              canCreateWorkspace
                ? t("noWorkspacesDescCreate")
                : t("noWorkspacesDescLocked")
            }
            action={newWorkspaceButton}
          />
        )}
      </Popover>
    </div>
  );
}
