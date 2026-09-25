import { Link } from "@/i18n/navigation";
import { type ButtonLook, buttonClassName } from "../Button/Button";

interface LinkButtonProps extends ButtonLook {
  href: string;
  className?: string;
  children?: React.ReactNode;
  "aria-label"?: string;
  title?: string;
}

/**
 * A link that looks like a `Button`. For something that goes somewhere: it is a real link, so
 * it opens in a new tab, can be copied and is announced as a link. A `Button` that only
 * navigates would be none of that.
 */
export function LinkButton({
  href,
  children,
  className,
  variant,
  size,
  full,
  icon,
  iconRight,
  textAlign,
  ...rest
}: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={buttonClassName(
        { variant, size, full, icon, iconRight, textAlign },
        !!children,
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
    </Link>
  );
}
