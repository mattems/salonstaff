import { Alert, AlertDescription, AlertTitle } from "@salonstaff/ui/components/alert";
import { Button } from "@salonstaff/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@salonstaff/ui/components/empty";
import { cn } from "@salonstaff/ui/lib/utils";
import { type ErrorComponentProps, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { errorMessage } from "@/lib/api";

export function Page({
  children,
  width = "default",
  className,
}: {
  children: ReactNode;
  width?: "narrow" | "default" | "wide";
  className?: string;
}) {
  const max = { narrow: "max-w-2xl", default: "max-w-4xl", wide: "max-w-6xl" }[width];
  return <div className={cn("mx-auto w-full px-4 py-8 sm:px-6", max, className)}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Section({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="space-y-1">
        <h2 className="font-semibold text-lg">{title}</h2>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function Notice({
  title,
  children,
  tone = "default",
}: {
  title?: ReactNode;
  children?: ReactNode;
  tone?: "default" | "destructive";
}) {
  return (
    <Alert variant={tone}>
      {title && <AlertTitle>{title}</AlertTitle>}
      {children && <AlertDescription>{children}</AlertDescription>}
    </Alert>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

export function NotFound() {
  return (
    <Page width="narrow">
      <EmptyState
        title="Page not found"
        description="There's nothing at this address. It may have moved, or the link may be wrong."
        action={
          <div className="flex gap-2">
            <Button asChild>
              <Link to="/jobs">Find jobs</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/">Home</Link>
            </Button>
          </div>
        }
      />
    </Page>
  );
}

export function PageError({ error, reset }: ErrorComponentProps) {
  return (
    <Page width="narrow">
      <EmptyState
        title="Something went wrong"
        description={errorMessage(error)}
        action={
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
        }
      />
    </Page>
  );
}
