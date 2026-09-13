"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Button } from "@/components/ui/atoms/Button/Button";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { Input } from "@/components/ui/atoms/Input/Input";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { FilterChip } from "@/components/ui/layout/FilterChip/FilterChip";
import {
  ModalFooter,
  ModalShortcut,
} from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import {
  Modal,
  ModalBody,
  ModalToolbar,
} from "@/components/ui/layout/Modal/Modal";
import {
  addIssueLinkAttachment,
  createIssue,
  updateIssue,
} from "@/features/issues/actions";
import {
  LabelDots,
  LabelIcon,
  PriorityIcon,
  StatusIcon,
  TypeIcon,
} from "@/features/issues/components/IssueIcons/IssueIcons";
import { IssueRichText } from "@/features/issues/components/IssueRichText/IssueRichText";
import { LabelPickerMenu } from "@/features/issues/components/LabelPickerMenu/LabelPickerMenu";
import type { IssueComposerData } from "@/features/issues/types";
import { uploadIssueAttachment } from "@/features/issues/uploadAttachment";
import { remapAttachmentIds } from "@/lib/richtext/attachments";
import { emptyDoc } from "@/lib/richtext/doc";
import type { PMDoc } from "@/lib/richtext/types";
import { useShortcut } from "@/lib/shortcuts/useShortcut";
import { fullName } from "@/lib/utils/string";
import { useSubmitShortcut } from "@/lib/utils/useSubmitShortcut";
import type { Label } from "@/types";

interface CreateIssueModalProps {
  /** Starting project — switchable in the header. */
  projectId: string;
  initialStatus: string;
  data: IssueComposerData;
  close: () => void;
}

export function CreateIssueModal({
  projectId: initialProjectId,
  initialStatus,
  data,
  close,
}: CreateIssueModalProps) {
  const {
    workspaceId,
    me,
    members,
    projects,
    labels: allLabels,
    statuses,
    priorities,
    issueTypes,
  } = data;
  const t = useTranslations();
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  /**
   * Focus belongs in the title field when the modal opens.
   *
   * `autoFocus` alone isn't reliable enough: `ModalFrame` grabs focus itself
   * and only backs off if the content already has it by the time its own
   * effect runs. Child effects run before their parent's — so from here the
   * ordering is guaranteed.
   */
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  const [isPending, startTransition] = useTransition();

  const [projectId, setProjectId] = useState(initialProjectId);
  const project = projects.find((p) => p.id === projectId);

  // Switching is only possible to a project where creation is actually
  // allowed. `projects` stays complete — it's used to resolve details of
  // existing issues.
  const creatableProjects = projects.filter((p) =>
    data.creatableProjectIds.includes(p.id),
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState<PMDoc>(emptyDoc);
  const [status, setStatus] = useState(initialStatus);
  const [priority, setPriority] = useState(0);
  const [type, setType] = useState(issueTypes[0]?.id ?? "feature");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [localLabels, setLocalLabels] = useState<Label[]>([]);

  /**
   * Images/links dropped into the description before the issue itself
   * exists — the real upload endpoints all require an `issueId`, which
   * doesn't exist yet at this point. Each gets a draft id and (for a file) a
   * local `blob:` preview URL instead; `submit()` turns them into real
   * `Attachment` rows once the issue has been created and swaps the draft
   * ids in the description for the real ones.
   */
  const pendingFiles = useRef<Map<string, { file: File; url: string }>>(
    new Map(),
  );
  const pendingLinks = useRef<
    Map<string, { url: string; name?: string; mimeType: string | null }>
  >(new Map());

  // Any preview URL still pending when the modal unmounts without a submit
  // (cancelled, or closed) would otherwise leak until the tab is closed.
  useEffect(() => {
    return () => {
      for (const { url } of pendingFiles.current.values()) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  const combinedLabels = [
    ...allLabels,
    ...localLabels.filter((l) => !allLabels.some((a) => a.id === l.id)),
  ];
  const assigneeUser = assignee
    ? (members.find((m) => m.id === assignee) ?? null)
    : null;

  /**
   * Labels can be project-bound (`Label.projectId`). On a project switch,
   * those from the old project are therefore dropped — workspace-wide
   * labels (`projectId: null`) are kept, as long as the new project hasn't
   * hidden them (`hiddenIn`). Without this cleanup, label IDs that aren't
   * even selectable in the new project would be submitted.
   */
  const changeProject = (id: string) => {
    setProjectId(id);
    setLabels((cur) =>
      cur.filter((labelId) => {
        const label = combinedLabels.find((l) => l.id === labelId);
        if (label?.projectId && label.projectId !== id) return false;
        return !label?.hiddenIn?.includes(id);
      }),
    );
  };

  const jumpToProject = (index: number) => {
    const target = creatableProjects[index];
    if (target) changeProject(target.id);
  };

  // "Strg/Cmd+1".."9" jump straight to that project — same convention as
  // the command palette's own quick-select for boards. A fixed run of
  // calls, not a loop: nine is the ceiling either way (`QUICK_SELECT_COUNT`
  // there), and Rules of Hooks needs a stable call count regardless.
  // `allowInEditable`: the title is focused by default when the modal
  // opens, and Ctrl/Cmd+digit isn't a text-editing shortcut any browser
  // uses bare — same reasoning as the issue panel's own mod+./mod+shift+,.
  const jumpOpts = { allowInEditable: true };
  useShortcut("mod+1", () => jumpToProject(0), jumpOpts);
  useShortcut("mod+2", () => jumpToProject(1), jumpOpts);
  useShortcut("mod+3", () => jumpToProject(2), jumpOpts);
  useShortcut("mod+4", () => jumpToProject(3), jumpOpts);
  useShortcut("mod+5", () => jumpToProject(4), jumpOpts);
  useShortcut("mod+6", () => jumpToProject(5), jumpOpts);
  useShortcut("mod+7", () => jumpToProject(6), jumpOpts);
  useShortcut("mod+8", () => jumpToProject(7), jumpOpts);
  useShortcut("mod+9", () => jumpToProject(8), jumpOpts);

  // Up/Down between the modal's fields: the title, the description preview
  // (`[data-field-nav]` from `EditableRichText` once it isn't being edited),
  // and the type/status/priority/assignee/label chips in the toolbar below.
  // Scoped to this modal's own body/toolbar (not `document`, unlike the
  // issue panel's own field-roving in `IssueDetailView.tsx`): opening this
  // modal over an already-open side panel leaves that panel's fields still
  // in the DOM, just visually covered, and an unscoped query would rove
  // into those too.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      // An open dropdown (type/status/… itself, or the project switcher)
      // owns Up/Down outright while it's open.
      if (document.querySelector("[data-popover-content]")) return;
      const fields = [
        ...(bodyRef.current?.querySelectorAll<HTMLElement>(
          "[data-field-nav]",
        ) ?? []),
        ...(toolbarRef.current?.querySelectorAll<HTMLElement>(
          "[data-field-nav]",
        ) ?? []),
      ];
      if (fields.length === 0) return;
      const active = document.activeElement;
      // A real, unmarked input/textarea/contentEditable (the description
      // once you're actually typing) keeps its arrow keys for the cursor —
      // only a marked field, or nothing in particular, is fair game.
      if (
        active instanceof HTMLElement &&
        !active.matches("[data-field-nav]") &&
        (active.tagName === "TEXTAREA" ||
          active.tagName === "INPUT" ||
          active.isContentEditable)
      ) {
        return;
      }
      const goingDown = event.key === "ArrowDown";
      const index = fields.indexOf(active as HTMLElement);
      const next =
        index === -1
          ? fields[goingDown ? 0 : fields.length - 1]
          : fields[index + (goingDown ? 1 : -1)];
      if (next) {
        event.preventDefault();
        next.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const statusName = (id: string) =>
    statuses.find((s) => s.id === id)?.name ?? id;
  const statusColor = (id: string) => statuses.find((s) => s.id === id)?.color;
  const priorityName = (id: number) =>
    priorities.find((p) => p.id === id)?.name ?? String(id);
  const typeName = (id: string) =>
    issueTypes.find((x) => x.id === id)?.name ?? id;
  const typeColor = (id: string) => issueTypes.find((x) => x.id === id)?.color;

  const submit = () => {
    if (!title.trim() || !project) return;
    startTransition(async () => {
      const { id: issueId } = await createIssue({
        title: title.trim(),
        description,
        status,
        priority,
        assignee,
        labels,
        type,
        projectId: project.id,
        reporterId: me.id,
      });

      // Draft images/links only turn into real `Attachment` rows now that
      // the issue — and with it, an `issueId` to attach them to — exists.
      if (pendingFiles.current.size > 0 || pendingLinks.current.size > 0) {
        const idMap = new Map<string, string | null>();

        for (const [draftId, { file, url }] of pendingFiles.current) {
          const result = await uploadIssueAttachment(issueId, file);
          idMap.set(draftId, "error" in result ? null : result.attachment.id);
          URL.revokeObjectURL(url);
        }
        for (const [draftId, link] of pendingLinks.current) {
          const result = await addIssueLinkAttachment(issueId, link);
          idMap.set(draftId, "error" in result ? null : result.attachment.id);
        }

        await updateIssue(issueId, {
          description: remapAttachmentIds(description, idMap),
        });
      }

      router.refresh();
      close();
    });
  };

  useSubmitShortcut(submit);

  const onUploadAttachment = async (file: File) => {
    const id = crypto.randomUUID();
    const url = URL.createObjectURL(file);
    pendingFiles.current.set(id, { file, url });
    return {
      id,
      url,
      name: file.name,
      mimeType: file.type || null,
      size: file.size,
    };
  };

  const onAddLinkAttachment = async ({
    url,
    name,
    mimeType,
  }: {
    url: string;
    name?: string;
    mimeType?: string | null;
  }) => {
    const id = crypto.randomUUID();
    pendingLinks.current.set(id, { url, name, mimeType: mimeType ?? null });
    return {
      id,
      url,
      name: name || url,
      mimeType: mimeType ?? null,
      size: null,
    };
  };

  const onRemoveAttachment = async (id: string) => {
    const file = pendingFiles.current.get(id);
    if (file) {
      URL.revokeObjectURL(file.url);
      pendingFiles.current.delete(id);
      return;
    }
    pendingLinks.current.delete(id);
  };

  if (!project) return null;

  const selectedLabelObjects = labels
    .map((id) => combinedLabels.find((l) => l.id === id))
    .filter(Boolean) as Label[];

  const labelName = t("fields.label");
  const labelLabel =
    labels.length === 0
      ? labelName
      : labels.length === 1
        ? (selectedLabelObjects[0]?.name ?? labelName)
        : t("filters.labels", { count: labels.length });
  const labelIcon =
    selectedLabelObjects.length === 0 ? (
      <Icon icon="lucide:tag" width={13} />
    ) : selectedLabelObjects.length === 1 ? (
      <LabelIcon color={selectedLabelObjects[0].color} size={13} />
    ) : (
      <LabelDots labels={selectedLabelObjects} />
    );

  const projectPicker = (
    <InlinePicker
      width={260}
      trigger={
        <Badge as="button" title={project.name}>
          <Avatar
            avatar={{
              name: project.name,
              color: project.color,
              image: project.avatarUrl ?? undefined,
            }}
            shape="circle"
            size={12}
          />
          {project.prefix}
          <Icon icon="lucide:chevron-down" width={12} />
        </Badge>
      }
    >
      {(closeMenu) => (
        <SelectMenu
          items={creatableProjects.map((p) => ({
            value: p.id,
            label: p.name,
            hint: p.prefix,
            icon: (
              <Avatar
                avatar={{
                  name: p.name,
                  color: p.color,
                  image: p.avatarUrl ?? undefined,
                }}
                shape="square"
                size={18}
              />
            ),
          }))}
          value={project.id}
          onPick={(v) => {
            changeProject(v as string);
            closeMenu();
          }}
          onClose={closeMenu}
          searchable
        />
      )}
    </InlinePicker>
  );

  return (
    <Modal>
      <ModalHeader
        leading={projectPicker}
        title={t("actions.newIssue")}
        onClose={close}
        closeLabel={t("actions.close")}
      />

      <ModalBody ref={bodyRef}>
        <Input
          appearance="title"
          ref={titleRef}
          aria-label={t("fields.title")}
          placeholder={t("placeholders.issueTitle")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          // Single-line — no second line for Up/Down to move the cursor to
          // anyway, so the field-roving effect above is free to claim them.
          data-field-nav
        />
        {/* Idle state is the committed text (or the placeholder) — the editor
            with its toolbar only appears once clicked into. No check/cross
            buttons: this modal already has its own down below. */}
        {/* `onChange` in addition to `onCommit`: Cmd/Ctrl + Enter is bound to
            `document` and submits before the field notices it lost focus.
            Without the running sync, the issue would be created without the
            most recently typed sentence. */}
        <IssueRichText
          value={description}
          onChange={setDescription}
          onCommit={setDescription}
          data={data}
          actions={false}
          label={t("fields.description")}
          placeholder={t("placeholders.addDescription")}
          onUploadAttachment={onUploadAttachment}
          onRemoveAttachment={onRemoveAttachment}
          onAddLinkAttachment={onAddLinkAttachment}
        />
      </ModalBody>

      {/* Type, status, and priority are required fields — they always carry a
          value, so they stay neutral and get no clear button. Assignee and
          labels are optional and stand out once set. */}
      <ModalToolbar ref={toolbarRef}>
        <FilterChip
          name={t("fields.type")}
          label={typeName(type)}
          icon={<TypeIcon type={type} size={14} color={typeColor(type)} />}
          active={false}
          width={190}
          data-field-nav
        >
          {(closeMenu) => (
            <SelectMenu
              items={issueTypes.map((x) => ({
                value: x.id,
                label: x.name,
                icon: <TypeIcon type={x.id} size={15} color={x.color} />,
              }))}
              value={type}
              onPick={(v) => {
                setType(v as string);
                closeMenu();
              }}
              onClose={closeMenu}
            />
          )}
        </FilterChip>

        <FilterChip
          name={t("fields.status")}
          label={statusName(status)}
          icon={
            <StatusIcon status={status} size={14} color={statusColor(status)} />
          }
          active={false}
          width={200}
          data-field-nav
        >
          {(closeMenu) => (
            <SelectMenu
              items={statuses.map((s) => ({
                value: s.id,
                label: statusName(s.id),
                icon: <StatusIcon status={s.id} size={15} color={s.color} />,
              }))}
              value={status}
              onPick={(v) => {
                setStatus(v as string);
                closeMenu();
              }}
              onClose={closeMenu}
            />
          )}
        </FilterChip>

        <FilterChip
          name={t("fields.priority")}
          label={priorityName(priority)}
          icon={<PriorityIcon priority={priority} size={14} />}
          active={false}
          width={190}
          data-field-nav
        >
          {(closeMenu) => (
            <SelectMenu
              items={priorities.map((p) => ({
                value: p.id,
                label: priorityName(p.id),
                icon: <PriorityIcon priority={p.id} size={15} />,
              }))}
              value={priority}
              onPick={(v) => {
                setPriority(v as number);
                closeMenu();
              }}
              onClose={closeMenu}
            />
          )}
        </FilterChip>

        <FilterChip
          name={t("fields.assignee")}
          label={assigneeUser ? assigneeUser.firstName : t("fields.assignee")}
          icon={
            assigneeUser ? (
              <Avatar avatar={assigneeUser} size={15} />
            ) : (
              <Icon icon="lucide:circle-dashed" width={14} />
            )
          }
          active={!!assigneeUser}
          onClear={() => setAssignee(null)}
          width={220}
          data-field-nav
        >
          {(closeMenu) => (
            <SelectMenu
              items={[
                {
                  value: null,
                  label: t("fields.unassigned"),
                  icon: <Avatar avatar={null} size={18} />,
                },
                ...members.map((u) => ({
                  value: u.id,
                  label: fullName(u),
                  icon: <Avatar avatar={u} size={18} />,
                })),
              ]}
              value={assignee}
              onPick={(v) => {
                setAssignee(v as string | null);
                closeMenu();
              }}
              onClose={closeMenu}
              searchable
            />
          )}
        </FilterChip>

        <FilterChip
          name={labelName}
          label={labelLabel}
          icon={labelIcon}
          active={labels.length > 0}
          onClear={() => setLabels([])}
          maxWidth={320}
          data-field-nav
        >
          {(closeMenu) => (
            <LabelPickerMenu
              allLabels={combinedLabels}
              selected={labels}
              projectId={project.id}
              projectName={project.name}
              workspaceId={workspaceId}
              onPick={(id) =>
                setLabels((cur) =>
                  cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
                )
              }
              onCreated={(label) => setLocalLabels((cur) => [...cur, label])}
              onClose={closeMenu}
              keepOpen
            />
          )}
        </FilterChip>
      </ModalToolbar>

      <ModalFooter
        hint={
          <ModalShortcut keys="mod+enter">{t("issues.toCreate")}</ModalShortcut>
        }
      >
        <Button variant="ghost" onClick={close}>
          {t("actions.cancel")}
        </Button>
        <Button
          variant="primary"
          disabled={!title.trim() || isPending}
          onClick={submit}
        >
          {t("actions.createIssue")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
