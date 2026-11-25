import { formatAbn } from "@salonstaff/shared";
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
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { type FormEvent, useState } from "react";
import { EmptyList, FormError, PageHeader, Section, useCursors } from "@/components/page";
import { errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { type Salon, type SalonFilters, salonsQuery } from "@/lib/queries";

const ALL = "all";
const ABN_STATUSES = ["not_started", "pending", "requires_input", "verified", "failed"] as const;
const STATUSES = ["active", "suspended", "removed"] as const;

export function validateSalonsSearch(search: Record<string, unknown>): SalonFilters {
  const one = <T extends string>(value: unknown, known: readonly T[]) =>
    known.includes(value as T) ? (value as T) : undefined;
  const abn = one(search.abn_status, ABN_STATUSES);
  const claimed = one(search.claimed, ["claimed", "unclaimed"] as const);
  const status = one(search.status, STATUSES);
  return {
    ...(typeof search.q === "string" && search.q ? { q: search.q } : {}),
    ...(abn ? { abn_status: abn } : {}),
    ...(claimed ? { claimed } : {}),
    ...(status ? { status } : {}),
  };
}

export function AbnBadge({ salon }: { salon: Pick<Salon, "abn" | "abn_status"> }) {
  if (!salon.abn) return <span className="text-muted-foreground">–</span>;
  const variant =
    salon.abn_status === "verified"
      ? "secondary"
      : salon.abn_status === "failed"
        ? "destructive"
        : "outline";
  return (
    <span className="flex flex-wrap items-center gap-1 whitespace-nowrap">
      {formatAbn(salon.abn)}
      <Badge variant={variant}>{humanize(salon.abn_status)}</Badge>
    </span>
  );
}

function FilterSelect<T extends string>(props: {
  label: string;
  value: T | undefined;
  options: { value: T; label: string }[];
  any: string;
  onChange: (value: T | undefined) => void;
}) {
  return (
    <Select
      value={props.value ?? ALL}
      onValueChange={(value) => props.onChange(value === ALL ? undefined : (value as T))}
    >
      <SelectTrigger className="w-40" aria-label={props.label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{props.any}</SelectItem>
        {props.options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SalonsPage() {
  const filters = useSearch({ from: "/salons" });
  const navigate = useNavigate({ from: "/salons" });
  const [draft, setDraft] = useState(filters.q ?? "");
  const { cursor, reset, pager } = useCursors();
  const salons = useQuery(salonsQuery(filters, cursor));
  const rows = salons.data?.data ?? [];
  const set = (patch: Partial<SalonFilters>) => {
    reset();
    navigate({ search: validateSalonsSearch({ ...filters, ...patch }) });
  };
  const search = (event: FormEvent) => {
    event.preventDefault();
    set({ q: draft.trim() || undefined });
  };

  return (
    <>
      <PageHeader
        title={filters.abn_status === "pending" ? "ABNs to check" : "Salons"}
        description={
          filters.abn_status === "pending"
            ? "Look each ABN up on the ABR, then mark it checked on the salon's page."
            : "Salons that signed up, and directory listings, newest first."
        }
      >
        <Button asChild variant="outline" size="sm">
          <Link to="/directory">Add listings</Link>
        </Button>
      </PageHeader>
      <form onSubmit={search} className="flex flex-wrap gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Name, suburb, ABN or owner's email"
          aria-label="Search salons"
          className="min-w-52 flex-1"
        />
        <Button type="submit" variant="outline">
          <Search />
          Search
        </Button>
        <FilterSelect
          label="Claimed"
          any="Claimed or not"
          value={filters.claimed}
          options={[
            { value: "claimed", label: "Claimed" },
            { value: "unclaimed", label: "Unclaimed" },
          ]}
          onChange={(claimed) => set({ claimed })}
        />
        <FilterSelect
          label="Status"
          any="Any status"
          value={filters.status}
          options={STATUSES.map((value) => ({ value, label: humanize(value) }))}
          onChange={(status) => set({ status })}
        />
        <FilterSelect
          label="ABN"
          any="Any ABN status"
          value={filters.abn_status}
          options={ABN_STATUSES.map((value) => ({
            value,
            label: `ABN ${humanize(value).toLowerCase()}`,
          }))}
          onChange={(abn_status) => set({ abn_status })}
        />
      </form>
      <FormError message={salons.isError ? errorMessage(salons.error) : null} />
      <Section>
        <CardTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Salon</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>ABN</TableHead>
                <TableHead>Live jobs</TableHead>
                <TableHead>Added</TableHead>
                <TableHead>Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((salon) => (
                <TableRow key={salon.id}>
                  <TableCell>
                    <Link
                      to="/salons/$salonId"
                      params={{ salonId: salon.id }}
                      className="font-medium"
                    >
                      {salon.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {salon.suburb}, {salon.state} {salon.postcode}
                    </div>
                  </TableCell>
                  <TableCell>
                    {salon.owner ? (
                      <Link to="/users/$userId" params={{ userId: salon.owner.id }}>
                        {salon.owner.email ?? salon.owner.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Unclaimed</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <AbnBadge salon={salon} />
                  </TableCell>
                  <TableCell className="tabular-nums">{salon.live_jobs}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(salon.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {salon.status !== "active" ? (
                        <Badge variant="destructive">{humanize(salon.status)}</Badge>
                      ) : null}
                      {salon.source === "directory" ? (
                        <Badge variant="outline">Directory</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardTable>
        {salons.isSuccess && rows.length === 0 ? <EmptyList>No salons match.</EmptyList> : null}
      </Section>
      {pager(salons.data?.next_cursor)}
    </>
  );
}
