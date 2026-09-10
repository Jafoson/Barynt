"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import { Table, type TableColumn } from "@/components/ui/layout/Table/Table";
import {
  setAllowWorkspaceCreation,
  setDefaultWorkspace,
} from "@/features/system-settings/actions";
import type { SystemSettingsData } from "@/features/system-settings/queries";
import styles from "./systemSettingsView.module.scss";

interface Props {
  data: SystemSettingsData;
}

/** A setting as a row: what it's about, what it means, and how you change
 *  it — same layout as `WorkspaceSettings`/`ProjectSettings`. */
interface SettingRow {
  id: string;
  label: string;
  desc: ReactNode;
  control: ReactNode;
}

const COLUMNS: TableColumn<SettingRow>[] = [
  {
    id: "setting",
    width: "minmax(0, 1fr)",
    cell: (row) => (
      <div className={styles.setting}>
        <span className={styles.label}>{row.label}</span>
        <span className={styles.desc}>{row.desc}</span>
      </div>
    ),
  },
  {
    id: "control",
    width: "minmax(220px, max-content)",
    align: "end",
    cell: (row) => row.control,
  },
];

/**
 * Two platform-wide flags: whether workspace creation is open to everyone,
 * and — for when it isn't — which workspace new accounts fall back to
 * (`lib/system-settings.ts`). Both write immediately on change, no "Save"
 * button, same convention as `Switch` and the reassign-owner picker in
 * `features/admin/components/PlatformProjects`.
 */
export function SystemSettingsView({ data }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [allow, setAllow] = useState(data.allowWorkspaceCreation);

  const run = (action: () => Promise<{ ok: true } | { error: string }>) =>
    startTransition(async () => {
      const result = await action();
      setError("error" in result ? result.error : "");
      router.refresh();
    });

  const toggleAllow = (checked: boolean) => {
    setAllow(checked);
    run(() => setAllowWorkspaceCreation(checked));
  };

  const rows: SettingRow[] = [
    {
      id: "allowCreation",
      label: t("systemSettings.allowCreation"),
      desc: t("systemSettings.allowCreationDesc"),
      control: (
        <Switch
          checked={allow}
          onChange={toggleAllow}
          label={t("systemSettings.allowCreation")}
          labelHidden
          disabled={isPending}
        />
      ),
    },
    {
      id: "defaultWorkspace",
      label: t("systemSettings.defaultWorkspace"),
      desc: t("systemSettings.defaultWorkspaceDesc"),
      control: (
        <InlinePicker
          trigger={
            <button
              type="button"
              className={styles.picker}
              disabled={isPending}
            >
              {data.defaultWorkspaceName ?? t("systemSettings.none")}
              <Icon icon="lucide:chevron-down" width={14} />
            </button>
          }
          width={260}
        >
          {(close) => (
            <SelectMenu
              searchable
              placeholder={t("systemSettings.searchWorkspaces")}
              items={[
                { value: null, label: t("systemSettings.none") },
                ...data.workspaces.map((w) => ({
                  value: w.id,
                  label: w.name,
                })),
              ]}
              value={data.defaultWorkspaceId}
              onPick={(value) => {
                run(() => setDefaultWorkspace(value as string | null));
                close();
              }}
              onClose={close}
            />
          )}
        </InlinePicker>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        divider={false}
        title={t("nav.adminSettings")}
        description={t("systemSettings.desc")}
      />

      <div className={styles.content}>
        {error && (
          <p className={styles.error} role="alert">
            <Icon icon="lucide:circle-alert" width={14} />
            {error}
          </p>
        )}

        <Table
          variant="card"
          label={t("nav.adminSettings")}
          columns={COLUMNS}
          rows={rows}
          getRowKey={(row) => row.id}
        />
      </div>
    </>
  );
}
