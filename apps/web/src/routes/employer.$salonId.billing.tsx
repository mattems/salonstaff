import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@salonstaff/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@salonstaff/ui/components/table";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { EntitlementSummary } from "@/components/employer";
import { FormMessage, useAction } from "@/components/form";
import { Notice, PageHeader } from "@/components/page";
import { api, unwrap } from "@/lib/api";
import { dollars, formatDate } from "@/lib/format";
import { privatePage } from "@/lib/seo";

interface BillingSearch {
  status?: "success" | "cancelled" | undefined;
}

export const Route = createFileRoute("/employer/$salonId/billing")({
  validateSearch: (search: Record<string, unknown>): BillingSearch => ({
    status:
      search.status === "success" || search.status === "cancelled" ? search.status : undefined,
  }),
  beforeLoad: ({ context, params }) => {
    if (context.salon.role !== "owner") {
      throw redirect({ to: "/employer/$salonId", params: { salonId: params.salonId } });
    }
  },
  loader: async ({ params }) =>
    unwrap(
      await api.GET("/v1/employer/salons/{salonId}/billing", {
        params: { path: { salonId: params.salonId } },
      }),
    ),
  head: () => privatePage("Billing"),
  component: Billing,
});

const KIND = {
  single_listing: "Single listing",
  salon_plan: "Salon Plan",
  founding_plan: "Salon Plan (founding price)",
} as const;

const PAYMENT = { pending: "Pending", paid: "Paid", failed: "Failed" } as const;

function Billing() {
  const billing = Route.useLoaderData();
  const { salonId } = Route.useParams();
  const path = { params: { path: { salonId } } };
  const { status } = Route.useSearch();
  const action = useAction();
  const subscribed = billing.subscription?.active ?? false;

  const go = (call: () => Promise<{ url: string }>) =>
    action.run(async () => {
      const { url } = await call();
      window.location.href = url;
    });
  const checkout = (kind: "single_listing" | "salon_plan") =>
    go(async () =>
      unwrap(
        await api.POST("/v1/employer/salons/{salonId}/billing/checkout", {
          ...path,
          body: { kind },
        }),
      ),
    );
  const portal = () =>
    go(async () => unwrap(await api.POST("/v1/employer/salons/{salonId}/billing/portal", path)));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description={
          <EntitlementSummary
            salonId={salonId}
            entitlement={billing.entitlement}
            freeUntil={billing.freeUntil}
            listingCredits={billing.listingCredits}
          />
        }
      />
      {status === "success" && (
        <Notice title="Thanks, your payment went through">
          What you bought shows here once the payment is confirmed, usually within a minute.
        </Notice>
      )}
      {status === "cancelled" && <Notice title="Payment cancelled">Nothing was charged.</Notice>}
      {!billing.billingOn && (
        <Notice title="Payments aren't switched on yet">
          Publishing is free during the launch period. Contact support@salonstaff.com.au to buy
          listings.
        </Notice>
      )}
      <FormMessage message={action.message} />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Free period</CardTitle>
            <CardDescription>
              {billing.freeUntil
                ? new Date(billing.freeUntil) > new Date()
                  ? `Unlimited free listings until ${formatDate(billing.freeUntil)}.`
                  : `Ended ${formatDate(billing.freeUntil)}.`
                : "None."}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Single listing</CardTitle>
            <CardDescription>
              {dollars(billing.prices.singleListingCents)} for one job, live for{" "}
              {billing.prices.listingDays} days. You have {billing.listingCredits} credit
              {billing.listingCredits === 1 ? "" : "s"}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              disabled={!billing.billingOn || action.pending}
              onClick={() => checkout("single_listing")}
            >
              Buy a listing
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Salon Plan {subscribed && <Badge>Active</Badge>}
            </CardTitle>
            <CardDescription>
              Unlimited listings for {dollars(billing.prices.planMonthlyCents)} a month
              {billing.founding && " (your founding salon price)"}.
              {billing.subscription?.currentPeriodEnd &&
                ` Renews ${formatDate(billing.subscription.currentPeriodEnd)}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {subscribed ? (
              <Button variant="outline" disabled={action.pending} onClick={portal}>
                Manage plan and invoices
              </Button>
            ) : (
              <Button
                disabled={!billing.billingOn || action.pending}
                onClick={() => checkout("salon_plan")}
              >
                Start the Salon Plan
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
      {billing.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {billing.payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{formatDate(payment.createdAt)}</TableCell>
                    <TableCell>{KIND[payment.kind]}</TableCell>
                    <TableCell>{dollars(payment.amountCents)}</TableCell>
                    <TableCell>{PAYMENT[payment.status]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
