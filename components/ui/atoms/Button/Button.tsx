import styles from "./button.module.scss";

type ButtonVariant = "primary" | "elevated" | "ghost" | "outline" | "text";
type ButtonSize = "sm" | "md" | "lg";

/** What decides how a button looks — shared by `Button` and `LinkButton`, so a link can look like one. */
export interface ButtonLook {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  textAlign?: "left" | "center" | "right";
}

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonLook {}

/**
 * The classes of a button with this look. `hasContent` says whether there is text (or anything
 * but an icon) in it: without, it is a square icon button.
 */
export function buttonClassName(
  {
    variant = "elevated",
    size = "md",
    full = false,
    icon,
    iconRight,
    textAlign = "center",
  }: ButtonLook,
  hasContent: boolean,
  className?: string,
): string {
  const isIconOnly = (!!icon || !!iconRight) && !hasContent;

  return [
    styles.btn,
    styles[variant],
    styles[size],
    full && styles.full,
    isIconOnly && styles.iconOnly,
    !isIconOnly && !!icon && styles.hasIcon,
    !isIconOnly && !!iconRight && styles.hasIconRight,
    textAlign && styles[`textAlign-${textAlign}`],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  children,
  variant,
  size,
  full,
  icon,
  iconRight,
  className,
  textAlign,
  ...rest
}: ButtonProps) {
  const cls = buttonClassName(
    { variant, size, full, icon, iconRight, textAlign },
    !!children,
    className,
  );

  return (
    <button className={cls} {...rest}>
      {icon}
      {children}
      {iconRight}
    </button>
  );
}
