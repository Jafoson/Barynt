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
import { createIssue } from "@/features/issues/actions";
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
import { emptyDoc } from "@/lib/richtext/doc";
import type { PMDoc } from "@/lib/richtext/types";
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
      await createIssue({
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
      router.refresh();
      close();
    });
  };

  useSubmitShortcut(submit);

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

      <ModalBody>
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
        />
      </ModalBody>

      {/* Type, status, and priority are required fields — they always carry a
          value, so they stay neutral and get no clear button. Assignee and
          labels are optional and stand out once set. */}
      <ModalToolbar>
        <FilterChip
          name={t("fields.type")}
          label={typeName(type)}
          icon={<TypeIcon type={type} size={14} color={typeColor(type)} />}
          active={false}
          width={190}
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
