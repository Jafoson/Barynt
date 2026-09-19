"use client";

import {
  LabelModal,
  type LabelModalProps,
} from "@/features/issues/components/LabelModal/LabelModal";
import { useModal } from "@/lib/context";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";

/**
 * Opens the label window (new or edit): a bottom sheet on a phone, a dialog
 * from a tablet up. One place for the choice — the workspace and project
 * label lists and the project overview all open the same window.
 */
export function useOpenLabelModal() {
  const { openModal } = useModal();
  const isPhone = useMediaQuery(PHONE_QUERY);

  return (props: Omit<LabelModalProps, "close" | "sheet">) =>
    openModal(
      ({ close }) => <LabelModal {...props} close={close} sheet={isPhone} />,
      isPhone ? { placement: "bottom" } : undefined,
    );
}
