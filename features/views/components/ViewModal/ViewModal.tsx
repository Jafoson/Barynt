"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { ColorPicker } from "@/components/ui/atoms/ColorPicker/ColorPicker";
import { Input } from "@/components/ui/atoms/Input/Input";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import {
  ModalFooter,
  ModalShortcut,
} from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import {
  createViewFromParams,
  updateView,
  type ViewResult,
} from "@/features/views/actions";
import { VIEW_ICONS } from "@/features/views/icons";
import type { ViewLayout, ViewVisibility } from "@/features/views/schema";
import { viewPath } from "@/features/views/url";
import { useRouter } from "@/i18n/navigation";
import { useUI } from "@/lib/ui-store";
import { PALETTE } from "@/lib/utils";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import styles from "./viewModal.module.scss";

/** What the dialog needs from an existing view. */
export interface EditableView {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  visibility: ViewVisibility;
}

export interface ViewModalProps {
  workspaceId: string;
  projectId: string;
  projectSlug: string;
  /** `view.share` in this project — without it "everyone" is offered but
   *  disabled, with the reason underneath. */
  canShare: boolean;
  /** Set = editing, unset = creating. */
  view?: EditableView;
  /** Creating: the address's view state right now (`pickViewState`), taken
   *  over unless the person unticks it. */
  currentParams?: Record<string, string>;
  /** Creating: the layout the board/list currently shows. */
  initialLayout?: ViewLayout;
  close: () => void;
  /** A bottom sheet (phone) instead of a dialog. */
  sheet?: boolean;
}

/**
 * Create and edit share one window (BARY-164). Editing leaves out the layout
 * and the "take over" box: the layout of an open view changes through the
 * board/list switch, its filters through the filter row, and both are then
 * saved with "Save".
 */
export function ViewModal({
  workspaceId,
  projectId,
  projectSlug,
  canShare,
  view,
  currentParams = {},
  initialLayout = "board",
  close,
  sheet,
}: ViewModalProps) {
  const t = useTranslations();
  const router = useRouter();
  const { toast } = useUI();
  const [isPending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);

  const [name, setName] = useState(view?.name ?? "");
  const [icon, setIcon] = useState<string | null>(view?.icon ?? null);
  const [color, setColor] = useState(view?.color ?? PALETTE[3]);
  const [layout, setLayout] = useState<ViewLayout>(initialLayout);
  const [visibility, setVisibility] = useState<ViewVisibility>(
    view?.visibility ?? "PRIVATE",
  );
  const [takeOver, setTakeOver] = useState(true);
  const [error, setError] = useState("");

  const trimmed = name.trim();
  const title = view ? t("views.editTitle") : t("views.newTitle");

  const errorText = (result: Extract<ViewResult<unknown>, { ok: false }>) =>
    result.error === "forbidden"
      ? t("views.errorForbidden")
      : result.error === "notFound"
        ? t("views.errorNotFound")
        : result.error === "invalid"
          ? t("views.errorInvalid")
          : t("views.errorGeneric");

  const submit = () => {
    if (!trimmed || isPending) return;
    startTransition(async () => {
      try {
        if (view) {
          const result = await updateView(view.id, {
            name: trimmed,
            icon,
            color,
            visibility,
          });
          if (!result.ok) return setError(errorText(result));
          toast(t("views.saved"));
          close();
          router.refresh();
          return;
        }

        const result = await createViewFromParams(
          {
            workspaceId,
            projectId,
            name: trimmed,
            icon,
            color,
            visibility,
            layout,
          },
          takeOver ? { ...currentParams, layout } : { layout },
        );
        if (!result.ok) return setError(errorText(result));
        toast(t("views.created"));
        close();
        // The bare address — the page redirects to the view's own state.
        router.push(viewPath(workspaceId, projectSlug, result.data.slug));
      } catch {
        setError(t("views.errorGeneric"));
      }
    });
  };

  return (
    <Modal
      width={460}
      variant={sheet ? "sheet" : "dialog"}
      style={sheet ? swipe.style : undefined}
      {...(sheet ? swipe.handlers : {})}
    >
      {sheet ? (
        <SheetHeader
          title={title}
          onClose={close}
          closeLabel={t("actions.cancel")}
        />
      ) : (
        <ModalHeader
          title={title}
          onClose={close}
          closeLabel={t("actions.cancel")}
        />
      )}

      <ModalBody ref={bodyRef}>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input
            label={t("fields.name")}
            value={name}
            autoFocus={!sheet}
            maxLength={80}
            error={error || undefined}
            placeholder={t("views.namePlaceholder")}
            iconLeft={
              <Icon
                icon={icon ?? "lucide:layers"}
                width={16}
                style={{ color }}
              />
            }
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
          />

          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t("views.icon")}</span>
            <div className={styles.icons}>
              {VIEW_ICONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={styles.iconOption}
                  data-active={icon === value || undefined}
                  aria-pressed={icon === value}
                  aria-label={t("views.pickIcon", {
                    icon: value.replace("lucide:", ""),
                  })}
                  onClick={() => setIcon(icon === value ? null : value)}
                >
                  <Icon icon={value} width={16} />
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t("fields.color")}</span>
            <ColorPicker
              value={color}
              onChange={setColor}
              swatchLabel={(c) => t("projectLabels.pickColor", { color: c })}
            />
          </div>

          {!view && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t("views.layout")}</span>
              <SegmentedControl
                variant="surface"
                value={layout}
                onChange={(v) => setLayout(v as ViewLayout)}
                items={[
                  {
                    value: "board",
                    label: t("views.layoutBoard"),
                    icon: <Icon icon="lucide:layout-dashboard" width={15} />,
                  },
                  {
                    value: "list",
                    label: t("views.layoutList"),
                    icon: <Icon icon="lucide:list" width={15} />,
                  },
                ]}
              />
            </div>
          )}

          <fieldset className={styles.field}>
            <legend className={styles.fieldLabel}>
              {t("views.visibility")}
            </legend>
            <div className={styles.choices}>
              <label className={styles.choice}>
                <input
                  type="radio"
                  name="visibility"
                  checked={visibility === "PRIVATE"}
                  onChange={() => setVisibility("PRIVATE")}
                />
                <Icon icon="lucide:lock" width={15} />
                <span className={styles.choiceText}>
                  {t("views.visibilityPrivate")}
                  <small>{t("views.visibilityPrivateHint")}</small>
                </span>
              </label>
              <label
                className={styles.choice}
                data-disabled={!canShare || undefined}
              >
                <input
                  type="radio"
                  name="visibility"
                  disabled={!canShare}
                  checked={visibility === "PROJECT"}
                  onChange={() => setVisibility("PROJECT")}
                />
                <Icon icon="lucide:users" width={15} />
                <span className={styles.choiceText}>
                  {t("views.visibilityProject")}
                  <small>
                    {canShare
                      ? t("views.visibilityProjectHint")
                      : t("views.visibilityNotAllowed")}
                  </small>
                </span>
              </label>
            </div>
          </fieldset>

          {!view && (
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={takeOver}
                onChange={(e) => setTakeOver(e.target.checked)}
              />
              {t("views.takeOver")}
            </label>
          )}

          {/* Submit via Enter — the button below sits outside the form. */}
          <button type="submit" hidden />
        </form>
      </ModalBody>

      <ModalFooter hint={<ModalShortcut keys="enter" />}>
        {!sheet && (
          <Button variant="ghost" disabled={isPending} onClick={close}>
            {t("actions.cancel")}
          </Button>
        )}
        <Button
          variant="primary"
          disabled={!trimmed || isPending}
          onClick={submit}
        >
          {view ? t("actions.save") : t("views.createAction")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
