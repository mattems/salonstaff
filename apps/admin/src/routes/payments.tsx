import { CardTable } from "@salonstaff/ui/card-table";
import { Badge } from "@salonstaff/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@salonstaff/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EmptyList, FormError, PageHeader, Section, useCursors } from "@/components/page";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatMoney, humanize, PAYMENT_KINDS } from "@/lib/format";
import { paymentsQuery } from "@/lib/queries";

export function PaymentsPage() {
  const { cursor, pager } = useCursors();
  const payments = useQuery(paymentsQuery(cursor));
  const rows = payments.data?.data ?? [];
  return (
    <>
      <PageHeader title="Payments" description="Listing credits and Salon Plans, newest first." />
      <FormError message={payments.isError ? errorMessage(payments.error) : null} />
      <Section>
        <CardTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Salon</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Provider</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(payment.created_at)}
                  </TableCell>
                  <TableCell>
                    <Link to="/salons/$salonId" params={{ salonId: payment.salon.id }}>
                      {payment.salon.name}
                    </Link>
                  </TableCell>
                  <TableCell>{PAYMENT_KINDS[payment.kind] ?? payment.kind}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(payment.amount_cents)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        payment.status === "paid"
                          ? "secondary"
                          : payment.status === "failed"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {humanize(payment.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{payment.provider}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardTable>
        {payments.isSuccess && rows.length === 0 ? <EmptyList>No payments yet.</EmptyList> : null}
      </Section>
      {pager(payments.data?.next_cursor)}
    </>
  );
}
