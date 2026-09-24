import { mock } from "bun:test";
import type { ReactNode } from "react";

// What the store page's tests share: the mocks of everything that is not the page (the
// browser's router, the modal frame, the translations, the actions), so each file starts
// from the same ones. Imported before the components, for its side effect.

export const openModal = mock((_render: unknown, _options: unknown) => "modal");
export const refresh = mock();
export const mockInstall = mock();
export const mockSetCurated = mock();
export const mockSetVisibility = mock();
export const mockSync = mock();
export const mockEnable = mock();
export const mockAddToWorkspace = mock();

// `startTransition` cannot be called after a server render; here it runs what it is
// given at once and remembers it, so a test can wait for it.
const actualReact = await import("react");
export let started: Promise<unknown>[] = [];
/** What `useTransition` says about whether something is running. */
export const transition = { pending: false };
export const resetStarted = () => {
  started = [];
};
export const settled = async () => {
  while (started.length > 0) await Promise.all(started.splice(0));
};

mock.module("react", () => ({
  ...actualReact,
  default: actualReact,
  useTransition: () => [
    transition.pending,
    (callback: () => unknown) => {
      started.push(Promise.resolve(callback()));
    },
  ],
}));
mock.module("@iconify/react", () => ({
  Icon: ({ icon, ...rest }: { icon: string; "aria-label"?: string }) => (
    <span role="img" data-icon={icon} aria-label={rest["aria-label"]} />
  ),
}));
mock.module("next-intl", () => {
  const t = (key: string, params?: Record<string, unknown>) =>
    params ? `${key}|${JSON.stringify(params)}` : key;
  t.rich = (key: string, params?: Record<string, unknown>) =>
    `${key}|${JSON.stringify(params, (_k, v) => (typeof v === "function" ? "fn" : v))}`;
  return {
    useTranslations: () => t,
    useLocale: () => "en",
    useFormatter: () => ({
      dateTime: (value: number) => `date:${value}`,
    }),
  };
});
mock.module("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
mock.module("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    className?: string;
    "aria-current"?: "page";
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
mock.module("@/lib/context", () => ({ useModal: () => ({ openModal }) }));
mock.module("@/features/plugins/storeActions", () => ({
  installStorePlugin: mockInstall,
  syncPluginStores: mockSync,
}));
mock.module("@/features/plugins/workspaceActions", () => ({
  enablePlugin: mockEnable,
}));
mock.module("@/features/plugins/workspaceStoreActions", () => ({
  addStorePluginToWorkspace: mockAddToWorkspace,
}));
mock.module("@/features/plugin-stores/visibilityActions", () => ({
  setPluginCurated: mockSetCurated,
  setPluginStoreVisibility: mockSetVisibility,
}));
mock.module("@/components/ui/layout/AcknowledgeModal/AcknowledgeModal", () => ({
  AcknowledgeModal: () => null,
}));
