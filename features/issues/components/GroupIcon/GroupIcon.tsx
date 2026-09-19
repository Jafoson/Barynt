import { Icon } from "@iconify/react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import {
  PriorityIcon,
  StatusIcon,
  TypeIcon,
} from "@/features/issues/components/IssueIcons/IssueIcons";
import type { GroupDef } from "@/features/issues/group";

/** The icon in front of a board column / list group name — depends on what is grouped by. */
export function GroupIcon({ group, size }: { group: GroupDef; size: number }) {
  switch (group.key) {
    case "status":
      return <StatusIcon status={group.id} size={size} color={group.color} />;
    case "priority":
      return <PriorityIcon priority={Number(group.id)} size={size} />;
    case "type":
      return <TypeIcon type={group.id} size={size} color={group.color} />;
    case "assignee":
      return group.member ? (
        <Avatar avatar={group.member} size={size + 3} />
      ) : (
        <Icon icon="lucide:user-round" width={size} />
      );
    case "storyPoints":
      return <Icon icon="lucide:hash" width={size} />;
  }
}
