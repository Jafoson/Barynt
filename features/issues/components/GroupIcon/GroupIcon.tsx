import { Icon } from "@iconify/react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { OptionVisual } from "@/features/custom-fields/components/OptionVisual/OptionVisual";
import {
  PriorityIcon,
  StatusIcon,
  TypeIcon,
} from "@/features/issues/components/IssueIcons/IssueIcons";
import { type GroupDef, isCustomGroupKey } from "@/features/issues/group";

/** The icon in front of a board column / list group name — depends on what is grouped by. */
export function GroupIcon({ group, size }: { group: GroupDef; size: number }) {
  // A choice of a custom field shows its own icon or image where it has one
  // and nothing otherwise: a generic circle in front of every column only
  // adds noise.
  if (isCustomGroupKey(group.key)) {
    return group.icon || group.imageUrl ? (
      <OptionVisual option={group} size={size} />
    ) : null;
  }
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
