"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { ColorPicker } from "@/components/ui/atoms/ColorPicker/ColorPicker";
import { Input } from "@/components/ui/atoms/Input/Input";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import {
  ModalFooter,
  ModalShortcut,
} from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import { updateProject } from "@/features/projects/actions";
import type { ProjectVisibility } from "@/features/projects/types";
import type { WorkspaceProjectRow } from "@/features/workspaces/types";
import { useSubmitShortcut } from "@/lib/utils/useSubmitShortcut";
import styles from "./editProjectModal.module.scss";

interface Props {
  project: WorkspaceProjectRow;
  onDone: () => void;
  close: () => void;
}

/**
 * Change a project's core data from the overview.
 *
 * The same four fields as under "General" in the project itself — here in
 * a dialog, so the list doesn't need to be left for it. The slug is
 * missing in both: it appears in every shared address and therefore stays
 * as it is.
 */
export function EditProjectModal({ project, onDone, close }: Props) {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(project.name);
  const [desc, setDesc] = useState(project.desc);
  const [prefix, setPrefix] = useState(project.prefix);
  const [color, setColor] = useState(project.color);
  const [visibility, setVisibility] = useState<ProjectVisibility>(
    project.visibility,
  );
  const [error, setError] = useState("");

  const trimmed = name.trim();

  const submit = () => {
    if (!trimmed || isPending) return;

    startTransition(async () => {
      const result = await updateProject(project.id, {
        name: trimmed,
        desc,
        prefix,
        color,
        visibility,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onDone();
      close();
    });
  };

  useSubmitShortcut(submit);

  return (
    <Modal width={480}>
      <ModalHeader
        leading={
          <Icon
            icon="lucide:columns-2"
            width={16}
            className={styles.headerIcon}
          />
        }
        title={t("workspaceProjects.editTitle")}
        onClose={close}
        closeLabel={t("actions.cancel")}
      />

      <ModalBody className={styles.body}>
        <Input
          autoFocus
          label={t("fields.name")}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
        />

        <Input
          label={t("fields.description")}
          placeholder={t("projects.descPlaceholder")}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />

        <Input
          label={t("projects.identifier")}
          hint={`${t("projects.example")} ${prefix || "WEB"}-123`}
          value={prefix}
          spellCheck={false}
          maxLength={4}
          onChange={(e) => {
            setPrefix(
              e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
            );
            setError("");
          }}
        />

        <div className={styles.field}>
          <span className={styles.label}>{t("fields.color")}</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        <div className={styles.field}>
          <span className={styles.label}>
            {t("projectSettings.visibility")}
          </span>
          <SegmentedControl
            items={[
              { value: "public", label: t("projectSettings.public") },
              { value: "private", label: t("projectSettings.private") },
            ]}
            value={visibility}
            onChange={(v) => setVisibility(v as ProjectVisibility)}
          />
          <span className={styles.hint}>
            {visibility === "public"
              ? t("projectSettings.publicDesc")
              : t("projectSettings.privateDesc")}
          </span>
        </div>

        {error && (
          <p className={styles.error} role="alert">
            <Icon icon="lucide:circle-alert" width={14} />
            {error}
          </p>
        )}
      </ModalBody>

      <ModalFooter hint={<ModalShortcut keys="mod+enter" />}>
        <Button variant="ghost" disabled={isPending} onClick={close}>
          {t("actions.cancel")}
        </Button>
        <Button
          variant="primary"
          disabled={!trimmed || isPending}
          onClick={submit}
        >
          {t("actions.save")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
