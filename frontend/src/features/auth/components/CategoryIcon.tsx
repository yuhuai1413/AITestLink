// CategoryIcon uses unified theme color
import { cn, pageStyles } from "../styles/pageStyles";
import type { Category, SubCategory } from "../types/interview";

interface CategoryIconProps {
  category: Category;
  /** Optional subcategory — uses its own Icon if provided. */
  subcategory?: SubCategory;
  /** Icon size class, e.g. "w-5 h-5". */
  iconSize?: string;
  /** Container size class, e.g. "w-10 h-10", "w-11 h-11". */
  size?: string;
  className?: string;
  /** Override foreground color, e.g. "white". */
  fgColor?: string;
}

/**
 * Unified category / subcategory icon with consistent accent color across all pages.
 */
export function CategoryIcon({
  category,
  subcategory,
  iconSize = "w-5 h-5",
  size = "w-10 h-10",
  className,
  fgColor,
}: CategoryIconProps) {
  const Icon = subcategory?.Icon ?? category.Icon;
  const accent = { bg: "rgba(91,33,182,0.15)", fg: "#5b21b6" };

  return (
    <div
      className={cn(pageStyles.roundIcon, size, className)}
      style={{ background: accent.bg }}
    >
      {Icon && (
        <Icon
          className={cn(iconSize)}
          style={{ color: fgColor || accent.fg }}
        />
      )}
    </div>
  );
}
