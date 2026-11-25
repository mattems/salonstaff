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
import { CopyButton } from "@/components/copy-button";
import { EmptyList, FormError, PageHeader, Section, useCursors } from "@/components/page";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { type UserFilters, usersQuery } from "@/lib/queries";

const ALL = "all";

export function validateUsersSearch(search: Record<string, unknown>): UserFilters {
  return {
    ...(typeof search.q === "string" && search.q ? { q: search.q } : {}),
    ...(search.role === "seeker" || search.role === "employer" ? { role: search.role } : {}),
    ...(search.banned === "true" ? { banned: "true" as const } : {}),
    ...(search.flagged === "true" ? { flagged: "true" as const } : {}),
  };
}

export function UsersPage() {
  const filters = useSearch({ from: "/users" });
  const navigate = useNavigate({ from: "/users" });
  const [draft, setDraft] = useState(filters.q ?? "");
  const { cursor, reset, pager } = useCursors();
  const users = useQuery(usersQuery(filters, cursor));
  const rows = users.data?.data ?? [];
  const set = (patch: Partial<UserFilters>) => {
    reset();
    navigate({ search: validateUsersSearch({ ...filters, ...patch }) as UserFilters });
  };
  const search = (event: FormEvent) => {
    event.preventDefault();
    set({ q: draft.trim() || undefined });
  };
  const state = filters.banned ? "banned" : filters.flagged ? "flagged" : ALL;

  return (
    <>
      <PageHeader title="People" description="Job seekers and employers, newest first." />
      <form onSubmit={search} className="flex flex-wrap gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Email, name, mobile or verification ID (SSV-…)"
          aria-label="Search people"
          className="min-w-52 flex-1"
        />
        <Button type="submit" variant="outline">
          <Search />
          Search
        </Button>
        <Select
          value={filters.role ?? ALL}
          onValueChange={(value) =>
            set({ role: value === ALL ? undefined : (value as UserFilters["role"]) })
          }
        >
          <SelectTrigger className="w-40" aria-label="Role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Everyone</SelectItem>
            <SelectItem value="seeker">Job seekers</SelectItem>
            <SelectItem value="employer">Employers</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={state}
          onValueChange={(value) =>
            set({
              banned: value === "banned" ? "true" : undefined,
              flagged: value === "flagged" ? "true" : undefined,
            })
          }
        >
          <SelectTrigger className="w-40" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            <SelectItem value="banned">Banned</SelectItem>
            <SelectItem value="flagged">Flagged</SelectItem>
          </SelectContent>
        </Select>
      </form>
      <FormError message={users.isError ? errorMessage(users.error) : null} />
      <Section>
        <CardTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <Link to="/users/$userId" params={{ userId: user.id }} className="font-medium">
                      {user.name || user.email || "No name yet"}
                    </Link>
                    {user.email ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {user.email}
                        <CopyButton value={user.email} label="Copy email address" />
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{user.phone ?? "–"}</TableCell>
                  <TableCell>{user.role === "employer" ? "Employer" : "Job seeker"}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(user.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.banned_at ? <Badge variant="destructive">Banned</Badge> : null}
                      {user.open_flags > 0 ? (
                        <Badge variant="outline">Flagged ({user.open_flags})</Badge>
                      ) : null}
                      {user.id_verified ? <Badge variant="secondary">ID checked</Badge> : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardTable>
        {users.isSuccess && rows.length === 0 ? <EmptyList>Nobody matches.</EmptyList> : null}
      </Section>
      {pager(users.data?.next_cursor)}
    </>
  );
}
