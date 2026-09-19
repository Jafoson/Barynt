"use client";

import { CreateProjectModal } from "@/features/projects/components/CreateProjectModal/CreateProjectModal";
import { useModal } from "@/lib/context";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";

/**
 * Opens "new project": a bottom sheet on a phone, a dialog from a tablet up.
 * One place for the choice, since the sidebar heading, the project pages and
 * the round "new" button all open the same window.
 */
export function useOpenCreateProject() {
  const { openModal } = useModal();
  const isPhone = useMediaQuery(PHONE_QUERY);

  return (workspaceId: string) =>
    openModal(
      ({ close }) => (
        <CreateProjectModal
          workspaceId={workspaceId}
          close={close}
          sheet={isPhone}
        />
      ),
      isPhone ? { placement: "bottom" } : undefined,
    );
}
