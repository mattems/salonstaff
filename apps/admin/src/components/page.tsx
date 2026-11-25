import { Alert, AlertDescription, AlertTitle } from "@salonstaff/ui/components/alert";
import { Button } from "@salonstaff/ui/components/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@salonstaff/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader } from "@salonstaff/ui/components/empty";
import { type ReactNode, useState } from "react";

/** A screen's heading, with its actions on the right. */
export function PageHeader(props: {
  title: string;
  image?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {props.image && <div className="shrink-0">{props.image}</div>}
      <div className="mr-auto min-w-0">
        <h2 className="text-xl font-semibold tracking-tight">{props.title}</h2>

        {props.description ? (
          <p className="text-sm text-muted-foreground">{props.description}</p>
        ) : null}
      </div>
      {props.children}
    </div>
  );
}

/** A titled card. Tables inside it scroll sideways on a phone rather than squashing. */
export function Section(props: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="gap-0 py-0">
      {props.title ? (
        <CardHeader className="flex flex-row flex-wrap items-center gap-2 border-b px-4 py-4">
          <div className="mr-auto min-w-0">
            <CardTitle className="text-sm">{props.title}</CardTitle>
            {props.description ? (
              <CardDescription className="text-xs">{props.description}</CardDescription>
            ) : null}
          </div>
          {props.action}
        </CardHeader>
      ) : null}
      <div>{props.children}</div>
    </Card>
  );
}

/** What a list shows when there is nothing in it. */
export function EmptyList(props: { children: ReactNode }) {
  return (
    <Empty className="py-8">
      <EmptyHeader>
        <EmptyDescription>{props.children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/** An inline error under a form, with the API's hint when it has one. */
export function FormError(props: { message: string | null; hint?: string | undefined }) {
  if (!props.message) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>{props.message}</AlertTitle>
      {props.hint ? <AlertDescription>{props.hint}</AlertDescription> : null}
    </Alert>
  );
}

/** Pages through a list by cursor: `cursor` opens the current page; `reset` when filters change. */
export function useCursors() {
  const [cursors, setCursors] = useState<string[]>([]);
  return {
    cursor: cursors.at(-1),
    reset: () => setCursors([]),
    pager: (next: string | null | undefined) => (
      <Pager
        hasPrevious={cursors.length > 0}
        next={next}
        onPrevious={() => setCursors((all) => all.slice(0, -1))}
        onNext={(cursor) => setCursors((all) => [...all, cursor])}
      />
    ),
  };
}

function Pager(props: {
  hasPrevious: boolean;
  next: string | null | undefined;
  onPrevious: () => void;
  onNext: (cursor: string) => void;
}) {
  if (!props.hasPrevious && !props.next) return null;
  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" size="sm" disabled={!props.hasPrevious} onClick={props.onPrevious}>
        Previous
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!props.next}
        onClick={() => props.next && props.onNext(props.next)}
      >
        Next
      </Button>
    </div>
  );
}

/** Label and value pairs, for a detail page. Empty values show as a dash. */
export function DetailList(props: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-2 p-4 text-sm">
      {props.items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">
            {value === null || value === undefined || value === "" ? "–" : value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A small count tile for the overview. */
export function Stat(props: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <Card className="gap-1 px-4 py-4">
      <CardDescription>{props.label}</CardDescription>
      <CardTitle className="text-2xl tabular-nums">{props.value}</CardTitle>
      {props.detail ? <p className="text-xs text-muted-foreground">{props.detail}</p> : null}
    </Card>
  );
}
