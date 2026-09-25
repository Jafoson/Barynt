import { describe, expect, it, mock } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// A link that looks like a button. What matters: it is a real link (an address a browser can open
// in a new tab, and that is announced as one), it has the classes of the button of the same look,
// and `Button` still looks as it did.

mock.module("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { Button } from "@/components/ui/atoms/Button/Button";
import { LinkButton } from "@/components/ui/atoms/LinkButton/LinkButton";

const classesOf = (html: string): string[] =>
  (html.match(/class="([^"]*)"/)?.[1] ?? "").split(" ").sort();

describe("a link that looks like a button", () => {
  it("is a link to the address, with its text", () => {
    const html = renderToStaticMarkup(
      <LinkButton href="/nimbus/plugin/settings/notes">Settings</LinkButton>,
    );
    expect(html).toContain('<a href="/nimbus/plugin/settings/notes"');
    expect(html).toContain(">Settings</a>");
    expect(html).not.toContain("<button");
  });

  it("has the classes of the button of the same look", () => {
    const look = { variant: "text", size: "sm" } as const;
    const link = renderToStaticMarkup(
      <LinkButton href="/x" {...look}>
        Go
      </LinkButton>,
    );
    const button = renderToStaticMarkup(<Button {...look}>Go</Button>);
    expect(classesOf(link)).toEqual(classesOf(button));
  });

  it("looks like a default button when nothing says otherwise", () => {
    const link = renderToStaticMarkup(<LinkButton href="/x">Go</LinkButton>);
    const button = renderToStaticMarkup(<Button>Go</Button>);
    expect(classesOf(link)).toEqual(classesOf(button));
    expect(classesOf(link)).toContain("elevated");
    expect(classesOf(link)).toContain("md");
  });

  it("puts the icon before the text, and marks that it has one", () => {
    const html = renderToStaticMarkup(
      <LinkButton href="/x" icon={<i data-icon="x" />}>
        Go
      </LinkButton>,
    );
    expect(html).toContain("<i data-icon");
    expect(html.indexOf("<i data-icon")).toBeLessThan(html.indexOf("Go"));
    expect(classesOf(html)).toContain("hasIcon");
  });

  it("is a square icon button without text, as a button is", () => {
    const link = renderToStaticMarkup(
      <LinkButton href="/x" icon={<i data-icon="x" />} aria-label="Open" />,
    );
    expect(classesOf(link)).toContain("iconOnly");
    expect(link).toContain('aria-label="Open"');
    const withText = renderToStaticMarkup(
      <LinkButton href="/x" icon={<i data-icon="x" />}>
        Go
      </LinkButton>,
    );
    expect(classesOf(withText)).not.toContain("iconOnly");
  });

  it("puts an icon on the right after the text", () => {
    const html = renderToStaticMarkup(
      <LinkButton href="/x" iconRight={<i data-icon="r" />}>
        Go
      </LinkButton>,
    );
    expect(html).toContain("<i data-icon");
    expect(html.indexOf("Go")).toBeLessThan(html.indexOf("<i data-icon"));
    expect(classesOf(html)).toContain("hasIconRight");
  });

  it("takes a class of its own, and a full width", () => {
    const html = renderToStaticMarkup(
      <LinkButton href="/x" className="mine" full>
        Go
      </LinkButton>,
    );
    expect(classesOf(html)).toContain("mine");
    expect(classesOf(html)).toContain("full");
  });
});

describe("a button", () => {
  it("is an elevated, medium, centered button when nothing says otherwise", () => {
    expect(classesOf(renderToStaticMarkup(<Button>Go</Button>))).toEqual(
      ["btn", "elevated", "md", "textAlign-center"].sort(),
    );
    expect(
      classesOf(renderToStaticMarkup(<LinkButton href="/x">Go</LinkButton>)),
    ).toEqual(["btn", "elevated", "md", "textAlign-center"].sort());
  });

  it("is a square icon button with only an icon on the right, too, and has no icon class then", () => {
    const right = renderToStaticMarkup(<Button iconRight={<i />} />);
    expect(classesOf(right)).toContain("iconOnly");
    expect(classesOf(right)).not.toContain("hasIconRight");
    const left = renderToStaticMarkup(<Button icon={<i />} />);
    expect(classesOf(left)).toContain("iconOnly");
    expect(classesOf(left)).not.toContain("hasIcon");
  });

  it("still has the classes it had: the look is one function now", () => {
    const html = renderToStaticMarkup(
      <Button variant="primary" size="lg" full textAlign="left" className="x">
        Save
      </Button>,
    );
    expect(classesOf(html)).toEqual(
      ["btn", "full", "lg", "primary", "textAlign-left", "x"].sort(),
    );
  });

  it("is a square icon button without text, and has an icon class with text", () => {
    const only = renderToStaticMarkup(<Button icon={<i />} />);
    expect(classesOf(only)).toContain("iconOnly");
    const withText = renderToStaticMarkup(<Button icon={<i />}>Go</Button>);
    expect(classesOf(withText)).toContain("hasIcon");
    expect(classesOf(withText)).not.toContain("iconOnly");
  });

  it("passes its other attributes on to the button", () => {
    const html = renderToStaticMarkup(
      <Button type="submit" disabled>
        Go
      </Button>,
    );
    expect(html).toContain('type="submit"');
    expect(html).toContain("disabled");
  });
});
