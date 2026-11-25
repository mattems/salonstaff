import { useRouter } from "@tanstack/react-router";
import type { ComponentProps, MouseEvent } from "react";

/**
 * A link to a ready-made address on this site (a job's or salon's `path` from the API, or a
 * path with a query), navigated in the app rather than reloading the page.
 */
export function AppLink({ href, onClick, ...props }: ComponentProps<"a"> & { href: string }) {
  const router = useRouter();
  function handle(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      props.target
    ) {
      return;
    }
    event.preventDefault();
    void router.navigate({ href });
  }
  return <a href={href} onClick={handle} {...props} />;
}
