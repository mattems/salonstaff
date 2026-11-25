import { CardTable } from "@salonstaff/ui/card-table";
import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import { Input } from "@salonstaff/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@salonstaff/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@salonstaff/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { EmptyList, FormError, PageHeader, Section } from "@/components/page";
import { errorMessage } from "@/lib/api";
import { describeChange, formatDateTime } from "@/lib/format";
import { type AuditEvent, type AuditFilters, auditQuery } from "@/lib/queries";

const ACTORS: { value: AuditFilters["actorType"]; label: string }[] = [
  { value: "all", label: "All actors" },
  { value: "staff", label: "Staff" },
  { value: "user", label: "People" },
  { value: "system", label: "System" },
];
const AGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last year" },
];

function Actor({ event }: { event: AuditEvent }) {
  if (event.actor_type === "system") return <span className="text-orange-600">System</span>;
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      {event.actor_name ?? "No longer exists"}
      {event.actor_type === "staff" ? <Badge variant="secondary">Staff</Badge> : null}
    </span>
  );
}

/** Links to the person or salon an event was about, when it has a page here. */
function Target({ event }: { event: AuditEvent }) {
  const id = event.target_id;
  if (!id) return <>–</>;
  const link = "underline decoration-dotted underline-offset-4 hover:decoration-solid";
  if (id.startsWith("usr_")) {
    return (
      <Link to="/users/$userId" params={{ userId: id }} className={link}>
        Person
      </Link>
    );
  }
  if (id.startsWith("sln_")) {
    return (
      <Link to="/salons/$salonId" params={{ salonId: id }} className={link}>
        Salon
      </Link>
    );
  }
  return <span className="font-mono text-xs">{event.target_type ?? id}</span>;
}

/** The filters, the table and its paging: every event, or those about one person or salon. */
export function AuditLog({ target, days }: { target?: string | undefined; days: number }) {
  const [draft, setDraft] = useState("");
  const [filters, setFilters] = useState<AuditFilters>({ q: "", actorType: "all", days });
  const [cursors, setCursors] = useState<string[]>([]);
  const audit = useQuery(auditQuery(filters, cursors.at(-1), target));

  const change = (patch: Partial<AuditFilters>) => {
    setCursors([]);
    setFilters((current) => ({ ...current, ...patch }));
  };
  const search = (event: FormEvent) => {
    event.preventDefault();
    change({ q: draft.trim() });
  };
  const rows = audit.data?.data ?? [];
  const next = audit.data?.next_cursor;

  return (
    <>
      <form onSubmit={search} className="flex flex-wrap gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Filter by who acted, or the action"
          aria-label="Filter the audit log"
          className="min-w-52 flex-1 sm:max-w-[340px]"
        />
        <Button type="submit" variant="outline">
          Filter
        </Button>
        <Select
          value={filters.actorType}
          onValueChange={(value) => change({ actorType: value as AuditFilters["actorType"] })}
        >
          <SelectTrigger aria-label="Actor" className="w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTORS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(filters.days)}
          onValueChange={(value) => change({ days: Number(value) })}
        >
          <SelectTrigger aria-label="Period" className="w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AGES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </form>
      <FormError message={audit.isError ? errorMessage(audit.error) : null} />
      <Section>
        <CardTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Detail</TableHead>
                {target ? null : <TableHead>About</TableHead>}
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((event) => (
                <TableRow
                  key={event.id}
                  // Things the system did by itself stand apart from what people did.
                  className={event.actor_type === "system" ? "bg-orange-600/10" : undefined}
                >
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(event.occurred_at)}
                  </TableCell>
                  <TableCell>
                    <Actor event={event} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{event.action}</TableCell>
                  <TableCell className="max-w-72 min-w-40 whitespace-normal">
                    {describeChange(event) || "–"}
                    {event.confirmed_with_passkey ? (
                      <span className="block text-xs text-muted-foreground">
                        Confirmed with a passkey
                      </span>
                    ) : null}
                    {event.reason ? (
                      <span className="block text-xs text-muted-foreground">
                        Reason: {event.reason}
                      </span>
                    ) : null}
                  </TableCell>
                  {target ? null : (
                    <TableCell>
                      <Target event={event} />
                    </TableCell>
                  )}
                  <TableCell className="font-mono text-xs">{event.ip ?? "–"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardTable>
        {audit.isSuccess && rows.length === 0 ? (
          <EmptyList>Nothing matches those filters.</EmptyList>
        ) : null}
      </Section>
      {cursors.length > 0 || next ? (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={cursors.length === 0}
            onClick={() => setCursors((all) => all.slice(0, -1))}
          >
            Newer
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!next}
            onClick={() => next && setCursors((all) => [...all, next])}
          >
            Older
          </Button>
        </div>
      ) : null}
    </>
  );
}

export function AuditLogPage() {
  const { target } = useSearch({ from: "/audit-log" });
  return (
    <>
      <PageHeader title="Audit log" description="What people, staff and the system did." />
      <AuditLog target={target} days={target ? 365 : 7} />
    </>
  );
}
