import { memo } from "react";
import { Link } from "@/i18n/routing";
import c from "@/utils/classNames";
import styles from "./Button.module.scss";

function Button({
  className,
  children,
  onClick,
  href,
  target,
  style = "default",
  size = "md",
  disabled,
  ariaLabel,
  title,
  fill,
  pill,
  locale,
}) {
  const fullClassName = c(
    styles.button,
    styles[disabled ? "disabled" : style],
    styles[size],
    fill && styles.fill,
    pill && styles.pill,
    className
  );

  return href ? (
    <Link
      className={fullClassName}
      href={href}
      target={target}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      locale={locale}
    >
      {children}
    </Link>
  ) : (
    <button
      className={fullClassName}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
    >
      {children}
    </button>
  );
}

export default memo(Button);
