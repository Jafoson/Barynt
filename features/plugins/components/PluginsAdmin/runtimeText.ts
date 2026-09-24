import { useTranslations } from "next-intl";
import type { ApprovalState, RuntimeState } from "@/features/plugins/overview";
import type { Problem } from "@/lib/plugins/resolve";
import type { PluginRowScope } from "@/lib/plugins/scope";

export type Tone = "ok" | "idle" | "problem";

/** How a state reads at a glance: fine, nothing to do, or something to look at. */
export function toneOf(state: RuntimeState): Tone {
  switch (state.kind) {
    case "running":
      return "ok";
    case "idle":
    case "off":
      return "idle";
    default:
      return "problem";
  }
}

/**
 * The sentences for what became of a plugin and for whether its code may be
 * approved. Every state and every reason has one; the codes come from the server
 * (`features/plugins/overview.ts`), the words are here so they are translated.
 */
export function useRuntimeText() {
  const t = useTranslations();

  const problem = (value: Problem): string => {
    switch (value.code) {
      case "host-incompatible":
        return t("pluginsAdmin.problem.host-incompatible", {
          range: value.range,
          host: value.host,
        });
      case "dependency-missing":
        return t("pluginsAdmin.problem.dependency-missing", {
          dependency: value.dependency,
          range: value.range,
        });
      case "dependency-version":
        return t("pluginsAdmin.problem.dependency-version", {
          dependency: value.dependency,
          range: value.range,
          installed: value.installed,
        });
      case "dependency-scope":
        return t("pluginsAdmin.problem.dependency-scope", {
          dependency: value.dependency,
          scope: value.scope,
          dependencyScope: value.dependencyScope,
        });
      case "dependency-unavailable":
        return t("pluginsAdmin.problem.dependency-unavailable", {
          dependency: value.dependency,
        });
      case "dependency-cycle":
        return t("pluginsAdmin.problem.dependency-cycle", {
          members: value.members.join(", "),
        });
    }
  };

  /** `scope` is where the plugin applies: "no workspace has switched it on" is said of a workspace plugin only. */
  const state = (value: RuntimeState, scope?: PluginRowScope): string => {
    switch (value.kind) {
      case "running":
        return value.mode === "in-process"
          ? t("pluginsAdmin.state.runningInProcess")
          : t("pluginsAdmin.state.runningDeclarative");
      case "idle":
        return scope === "PROJECT"
          ? t("pluginsAdmin.state.idleProject")
          : t("pluginsAdmin.state.idle");
      case "off":
        return t("pluginsAdmin.state.off");
      case "missing":
        return t("pluginsAdmin.state.missing");
      case "unknown":
        return t("pluginsAdmin.state.unknown");
      case "invalid":
        return t("pluginsAdmin.state.invalid", {
          issues: value.issues.join("; "),
        });
      case "blocked":
        return t(`pluginsAdmin.blocked.${value.reason}`);
      case "failed":
        return t("pluginsAdmin.state.failed", {
          phase: t(`pluginsAdmin.phase.${value.phase}`),
          message: value.message,
        });
      case "incompatible":
        return value.problems.map(problem).join(" ");
    }
  };

  /** The line about the code approval, or `null` where there is nothing to say. */
  const approval = (value: ApprovalState): string | null => {
    switch (value.kind) {
      case "none":
        return null;
      case "approved":
        return t("pluginsAdmin.approval.approved");
      case "open":
        return t("pluginsAdmin.approval.open");
      case "outdated":
        return t("pluginsAdmin.approval.outdated");
      case "refused":
        return t(`pluginsAdmin.approval.refused.${value.reason}`);
    }
  };

  return { state, approval };
}
