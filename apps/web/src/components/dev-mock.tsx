/**
 * The local stand-ins for Stripe Identity and Stripe Checkout. They exist only when the API is
 * the local one (`ENVIRONMENT=local`); anywhere else they're a 404.
 */
import { Button } from "@salonstaff/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@salonstaff/ui/components/card";
import { notFound } from "@tanstack/react-router";
import { isLocalApi } from "@/lib/environment";
import { FormMessage, useAction } from "./form";
import { Page } from "./page";

export async function requireLocal() {
  if (!(await isLocalApi())) throw notFound();
}

export function MockPage({
  title,
  description,
  choices,
}: {
  title: string;
  description: string;
  choices: { label: string; primary?: boolean; run: () => Promise<void> }[];
}) {
  const action = useAction();
  return (
    <Page width="narrow">
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            {choices.map((choice) => (
              <Button
                key={choice.label}
                variant={choice.primary ? "default" : "outline"}
                disabled={action.pending}
                onClick={() => action.run(choice.run)}
              >
                {choice.label}
              </Button>
            ))}
          </div>
          <FormMessage message={action.message} />
        </CardContent>
      </Card>
    </Page>
  );
}
