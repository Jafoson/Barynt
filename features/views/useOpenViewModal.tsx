"use client";

import {
  ViewModal,
  type ViewModalProps,
} from "@/features/views/components/ViewModal/ViewModal";
import { useModal } from "@/lib/context";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";

/**
 * Opens the view window (new or edit): a bottom sheet on a phone, a dialog
 * from a tablet up. One place for the choice — the views row, its menu and
 * the "New view" button in the filter row all open the same window.
 */
export function useOpenViewModal() {
  const { openModal } = useModal();
  const isPhone = useMediaQuery(PHONE_QUERY);

  return (props: Omit<ViewModalProps, "close" | "sheet">) =>
    openModal(
      ({ close }) => <ViewModal {...props} close={close} sheet={isPhone} />,
      isPhone ? { placement: "bottom" } : undefined,
    );
}
