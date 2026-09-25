"use client";

import {
  CustomFieldModal,
  type CustomFieldModalProps,
} from "@/features/custom-fields/components/CustomFieldModal/CustomFieldModal";
import { useModal } from "@/lib/context";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";

/**
 * Opens the custom field window (new or change): a bottom sheet on a phone, a dialog from a tablet
 * up. One place for the choice, like `useOpenLabelModal`: the workspace's page and a project's page
 * both open the same window.
 */
export function useOpenCustomFieldModal() {
  const { openModal } = useModal();
  const isPhone = useMediaQuery(PHONE_QUERY);

  return (props: Omit<CustomFieldModalProps, "close" | "sheet">) =>
    openModal(
      ({ close }) => (
        <CustomFieldModal {...props} close={close} sheet={isPhone} />
      ),
      isPhone ? { placement: "bottom" } : undefined,
    );
}
