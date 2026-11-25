import { AU_STATES } from "@salonstaff/shared";
import { CardTable } from "@salonstaff/ui/card-table";
import { Alert, AlertDescription, AlertTitle } from "@salonstaff/ui/components/alert";
import { Button } from "@salonstaff/ui/components/button";
import { Input } from "@salonstaff/ui/components/input";
import { Label } from "@salonstaff/ui/components/label";
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
import { Textarea } from "@salonstaff/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { FormError, PageHeader, Section } from "@/components/page";
import { ApiProblem, api, errorMessage, unwrap } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { can, type ImportReport, type ListingInput, meQuery, refreshAll } from "@/lib/queries";

const COLUMNS = [
  "name",
  "suburb",
  "state",
  "postcode",
  "address",
  "phone",
  "email",
  "website",
  "instagram",
  "abn",
  "about",
];

function downloadTemplate() {
  downloadCsv("salon-directory-template", [
    {
      name: "Willow & Ash Hair",
      suburb: "Surry Hills",
      state: "NSW",
      postcode: "2010",
      address: "12 Crown St",
      phone: "02 9000 0000",
      email: "hello@willowandash.example",
      website: "https://willowandash.example",
      instagram: "willowandash",
      abn: "",
      about: "Colour specialists since 2012.",
    },
  ]);
}

function ImportCsv() {
  const [file, setFile] = useState<File | null>(null);
  const upload = useMutation({
    mutationFn: async (csv: File): Promise<ImportReport> =>
      unwrap(
        await api.POST("/admin/v1/directory/import", {
          body: { file: csv as unknown as string },
          bodySerializer: (body) => {
            const form = new FormData();
            form.append("file", body.file as unknown as Blob);
            return form;
          },
        }),
      ),
    onSuccess: async (report) => {
      await refreshAll();
      toast.success(`${report.added} listings added`);
    },
  });
  const problem = upload.error instanceof ApiProblem ? upload.error : null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (file) upload.mutate(file);
  };
  const report = upload.data;

  return (
    <Section
      title="Import a CSV"
      description={`Up to 5,000 rows. The first row is the header: ${COLUMNS.join(",")}. Name, suburb, state and postcode are required.`}
      action={
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          Download a template
        </Button>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="directory-csv">CSV file</Label>
            <Input
              id="directory-csv"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <Button type="submit" disabled={!file || upload.isPending}>
            {upload.isPending ? "Importing…" : "Import"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Salons already listed (same ABN, or same name and postcode) are skipped, so importing a
          file twice adds nothing. Only import data we may use: a business's own published details,
          the ABR or licensed data.
        </p>
        <FormError
          message={upload.error ? errorMessage(upload.error) : null}
          hint={problem?.hint}
        />
      </form>
      {report ? (
        <div className="flex flex-col gap-3 border-t p-4">
          <Alert>
            <AlertTitle>
              {report.added} added · {report.duplicates} already listed · {report.errors.length}{" "}
              with problems
            </AlertTitle>
            <AlertDescription>
              <Link
                to="/salons"
                search={{ claimed: "unclaimed" }}
                className="underline underline-offset-4"
              >
                See unclaimed listings
              </Link>
            </AlertDescription>
          </Alert>
          {report.errors.length > 0 ? (
            <CardTable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Problem (row skipped)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.errors.map((error) => (
                    <TableRow key={error.row}>
                      <TableCell className="tabular-nums">{error.row}</TableCell>
                      <TableCell className="whitespace-normal">{error.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardTable>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}

const EMPTY: ListingInput = { name: "", suburb: "", state: "NSW", postcode: "" };
const OPTIONAL: { key: keyof ListingInput; label: string; type?: string }[] = [
  { key: "address", label: "Address" },
  { key: "phone", label: "Phone", type: "tel" },
  { key: "email", label: "Business email", type: "email" },
  { key: "website", label: "Website", type: "url" },
  { key: "instagram", label: "Instagram" },
  { key: "abn", label: "ABN" },
];

function AddListing() {
  const [listing, setListing] = useState<ListingInput>(EMPTY);
  const set = (key: keyof ListingInput, value: string) =>
    setListing((current) => ({ ...current, [key]: value }));
  const add = useMutation({
    mutationFn: async () => {
      const body = Object.fromEntries(
        Object.entries(listing).filter(
          ([, value]) => typeof value === "string" && value.trim() !== "",
        ),
      ) as ListingInput;
      return unwrap(await api.POST("/admin/v1/directory/listings", { body }));
    },
    onSuccess: async (salon) => {
      await refreshAll();
      toast.success(`${salon.name} added to the directory`);
      setListing(EMPTY);
    },
  });
  const problem = add.error instanceof ApiProblem ? add.error : null;

  return (
    <Section
      title="Add one listing"
      description="An unclaimed salon in the public directory, which its owner can claim."
    >
      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          add.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="listing-name">Name</Label>
            <Input
              id="listing-name"
              value={listing.name}
              onChange={(e) => set("name", e.target.value)}
              required
              maxLength={200}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="listing-suburb">Suburb</Label>
            <Input
              id="listing-suburb"
              value={listing.suburb}
              onChange={(e) => set("suburb", e.target.value)}
              required
              maxLength={100}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="listing-state">State</Label>
            <Select value={listing.state} onValueChange={(value) => set("state", value)}>
              <SelectTrigger id="listing-state">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AU_STATES.map((state) => (
                  <SelectItem key={state.value} value={state.value}>
                    {state.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="listing-postcode">Postcode</Label>
            <Input
              id="listing-postcode"
              value={listing.postcode}
              onChange={(e) => set("postcode", e.target.value)}
              required
              inputMode="numeric"
              pattern="\d{4}"
            />
          </div>
          {OPTIONAL.map((field) => (
            <div key={field.key} className="flex flex-col gap-1.5">
              <Label htmlFor={`listing-${field.key}`}>{field.label}</Label>
              <Input
                id={`listing-${field.key}`}
                type={field.type ?? "text"}
                value={listing[field.key] ?? ""}
                onChange={(e) => set(field.key, e.target.value)}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="listing-about">About</Label>
          <Textarea
            id="listing-about"
            value={listing.about ?? ""}
            onChange={(e) => set("about", e.target.value)}
            rows={3}
            maxLength={2000}
          />
        </div>
        <FormError message={add.error ? errorMessage(add.error) : null} hint={problem?.hint} />
        <div>
          <Button type="submit" disabled={add.isPending}>
            {add.isPending ? "Adding…" : "Add listing"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

export function DirectoryPage() {
  const me = useQuery(meQuery).data;
  if (!me) return null;
  if (!can(me, "directory:import")) {
    return (
      <>
        <PageHeader title="Directory import" />
        <Alert>
          <AlertTitle>Your staff role can't add listings</AlertTitle>
          <AlertDescription>Ask a staff owner or support.</AlertDescription>
        </Alert>
      </>
    );
  }
  return (
    <>
      <PageHeader
        title="Directory import"
        description="Add salons to the public directory. Owners claim them by ABN plus an emailed link, or staff review."
      />
      <ImportCsv />
      <AddListing />
    </>
  );
}
