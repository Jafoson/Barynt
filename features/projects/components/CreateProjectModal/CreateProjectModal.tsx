"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
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
import { createProject } from "@/features/projects/actions";
import type { ProjectVisibility } from "@/features/projects/types";
import { PALETTE } from "@/lib/utils";
import { useSubmitShortcut } from "@/lib/utils/useSubmitShortcut";
import styles from "./createProjectModal.module.scss";

/** The prefix is the issue identifier (WEB-123) — max. 4 alphanumeric characters. */
function suggestPrefix(name: string) {
  return name
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 4);
}

interface CreateProjectModalProps {
  workspaceId: string;
  close: () => void;
}

export function CreateProjectModal({
  workspaceId,
  close,
}: CreateProjectModalProps) {
  const t = useTranslations();
  const router = useRouter();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [prefix, setPrefix] = useState("");
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [color, setColor] = useState(PALETTE[0]);
  const [visibility, setVisibility] = useState<ProjectVisibility>("public");
  const [error, setError] = useState("");

  // As long as the prefix hasn't been touched by hand, it follows the name.
  const effectivePrefix = prefixTouched ? prefix : suggestPrefix(name);

  const submit = () => {
    if (!name.trim()) return;
    setError("");
    startTransition(async () => {
      const result = await createProject({
        workspaceId,
        name: name.trim(),
        desc,
        prefix: effectivePrefix,
        color,
        visibility,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      close();
    });
  };

  useSubmitShortcut(submit);

  // Moves focus to the next/previous `[data-field-nav]` field — name,
  // description, prefix, the active color swatch, the active visibility
  // segment — from wherever it currently is. Scoped to this modal's own
  // body (not `document`, unlike the issue panel's own field-roving in
  // `IssueDetailView.tsx`): opening this over an already-open issue panel
  // leaves that panel's fields still in the DOM, just visually covered,
  // and an unscoped query would rove into those too.
  //
  // Shared by the Up/Down listener below and `ColorPicker`'s `onConfirm`:
  // Enter/Space on a swatch already picks it (native click), so from
  // there "confirm" and "go to the next field" are the same action.
  const moveFocus = useCallback(
    (event: KeyboardEvent | null, direction: 1 | -1) => {
      const fields = Array.from(
        bodyRef.current?.querySelectorAll<HTMLElement>("[data-field-nav]") ??
          [],
      );
      if (fields.length === 0) return;
      const active = document.activeElement;
      const index = fields.indexOf(active as HTMLElement);
      const next =
        index === -1
          ? fields[direction === 1 ? 0 : fields.length - 1]
          : fields[index + direction];
      if (next) {
        event?.preventDefault();
        next.focus();
      }
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (document.querySelector("[data-popover-content]")) return;
      const active = document.activeElement;
      // A real, unmarked input keeps its arrow keys — only a marked field,
      // or nothing in particular, is fair game.
      if (
        active instanceof HTMLElement &&
        !active.matches("[data-field-nav]") &&
        (active.tagName === "TEXTAREA" ||
          active.tagName === "INPUT" ||
          active.isContentEditable)
      ) {
        return;
      }
      moveFocus(event, event.key === "ArrowDown" ? 1 : -1);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [moveFocus]);

  return (
    <Modal>
      <ModalHeader
        leading={
          <Icon
            icon="lucide:columns-2"
            width={16}
            className={styles.headerIcon}
          />
        }
        title={t("projects.modalTitle")}
        onClose={close}
        closeLabel={t("actions.close")}
      />

      <ModalBody className={styles.body} ref={bodyRef}>
        <Input
          autoFocus
          label={t("placeholders.projectName")}
          placeholder="Web App"
          value={name}
          onChange={(e) => setName(e.target.value)}
          // Single-line — no second line for Up/Down to move the cursor to
          // anyway, so the field-roving effect above is free to claim them.
          data-field-nav
        />

        {/* The sentence that later appears next to the name in the project
            overview. Optional — whoever skips it here can add it later in
            the project's settings. */}
        <Input
          label={t("fields.description")}
          placeholder={t("projects.descPlaceholder")}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          data-field-nav
        />

        <div className={styles.prefixRow}>
          <Input
            className={styles.prefixInput}
            label={t("projects.identifier")}
            hint={`${t("projects.example")} ${effectivePrefix || "WEB"}-123`}
            placeholder="WEB"
            value={effectivePrefix}
            spellCheck={false}
            maxLength={4}
            onChange={(e) => {
              setPrefixTouched(true);
              setPrefix(suggestPrefix(e.target.value));
            }}
            data-field-nav
          />
        </div>

        <div className={styles.field}>
          <span className={styles.label}>{t("fields.color")}</span>
          <ColorPicker
            value={color}
            onChange={setColor}
            fieldNav
            onConfirm={() => moveFocus(null, 1)}
          />
        </div>

        {/* The choice is made here because it decides who gets enrolled:
            public admits the whole workspace, private only you. */}
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
            fieldNav
            onConfirm={() => moveFocus(null, 1)}
          />
          <span className={styles.hint}>
            {visibility === "public"
              ? t("projectSettings.publicDesc")
              : t("projectSettings.privateDescNew")}
          </span>
        </div>

        {error && <p className={styles.error}>{error}</p>}
      </ModalBody>

      <ModalFooter
        hint={
          <ModalShortcut keys="mod+enter">
            {t("projects.toCreate")}
          </ModalShortcut>
        }
      >
        <Button variant="ghost" onClick={close}>
          {t("actions.cancel")}
        </Button>
        <Button
          variant="primary"
          disabled={!name.trim() || isPending}
          onClick={submit}
        >
          {t("actions.createProject")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
