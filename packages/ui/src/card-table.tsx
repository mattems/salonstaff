import { cn } from "cn";
import type { ComponentProps } from "react";

/**
 * Every table in a card sits in one of these: it runs to the card's edges, so rows' borders and
 * hover meet the sides, and its first and last columns line up with the card's title. Inside a
 * padded `CardContent` it reaches out through the padding, so never wrap it in a box that scrolls
 * or clips.
 *
 * The lines between rows are drawn on the cells, with separate borders: collapsed borders give
 * each row half of the line above it, so rows land on half pixels and a button in one renders a
 * pixel off on a standard screen.
 */
export function CardTable({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-table"
      className={cn(
        "overflow-x-auto in-data-[slot=card-content]:-mx-(--card-spacing) [[data-slot=card-content]>&]:last:-mb-(--card-spacing) [&_table]:border-separate [&_table]:border-spacing-0 [&_th]:border-b [&_tbody>tr:not(:last-child)>td]:border-b [&_tr>:first-child]:pl-[var(--card-spacing,1rem)] [&_tr>:last-child]:pr-[var(--card-spacing,1rem)]",
        className,
      )}
      {...props}
    />
  );
}
