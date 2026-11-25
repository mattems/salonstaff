import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MockPage, requireLocal } from "@/components/dev-mock";
import { api, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";

interface MockSearch {
  ref?: string | undefined;
}

/** Local only: stands in for Stripe Checkout. */
export const Route = createFileRoute("/dev/mock-checkout")({
  validateSearch: (search: Record<string, unknown>): MockSearch => ({
    ref: typeof search.ref === "string" ? search.ref : undefined,
  }),
  loader: requireLocal,
  head: () => privatePage("Mock checkout"),
  component: MockCheckout,
});

function MockCheckout() {
  const { ref } = Route.useSearch();
  const navigate = useNavigate();
  const finish = (outcome: "paid" | "cancelled") => async () => {
    unwrap(
      await api.POST("/v1/dev/checkout/{ref}", {
        params: { path: { ref: ref ?? "" } },
        body: { outcome },
      }),
    );
    await navigate({
      to: "/employer/billing",
      search: { status: outcome === "paid" ? "success" : "cancelled" },
    });
  };
  return (
    <MockPage
      title="Mock checkout"
      description={`Local stand-in for Stripe Checkout (reference ${ref ?? "missing"}). Pay grants what was bought.`}
      choices={[
        { label: "Pay", primary: true, run: finish("paid") },
        { label: "Cancel", run: finish("cancelled") },
      ]}
    />
  );
}
