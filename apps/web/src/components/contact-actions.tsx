/**
 * How a salon's team gets in touch with a job seeker (D-13, D-19): a message in their conversation
 * (the Messages page), and their mobile, shown on request. Both show in the conversation, so they
 * know who got in touch.
 */
import { Button } from "@salonstaff/ui/components/button";
import { Link } from "@tanstack/react-router";
import { MessageSquare, Phone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { localMobile } from "@/components/account-security";
import { api, errorMessage, type Schemas, unwrap } from "@/lib/api";

export function ContactActions({
  salonId,
  candidateId,
  firstName,
  contact,
}: {
  salonId: string;
  candidateId: string;
  firstName: string;
  contact: Schemas["ContactOptions"];
}) {
  const [phone, setPhone] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);

  if (!contact.message && !contact.phone) {
    return <p className="text-muted-foreground text-sm">You can't contact this person.</p>;
  }

  async function reveal() {
    setRevealing(true);
    try {
      const result = unwrap(
        await api.POST("/v1/employer/salons/{salonId}/candidates/{userId}/phone", {
          params: { path: { salonId, userId: candidateId } },
        }),
      );
      setPhone(result.phone);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRevealing(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {contact.message && (
          <Button asChild>
            <Link
              to="/employer/$salonId/messages"
              params={{ salonId }}
              search={{ with: candidateId }}
            >
              <MessageSquare aria-hidden />
              Message {firstName}
            </Link>
          </Button>
        )}
        {contact.phone &&
          (phone ? (
            <Button asChild variant="outline">
              <a href={`tel:${phone}`}>
                <Phone aria-hidden />
                Call {localMobile(phone)}
              </a>
            </Button>
          ) : (
            <Button variant="outline" disabled={revealing} onClick={reveal}>
              <Phone aria-hidden />
              Show number
            </Button>
          ))}
      </div>
      <p className="text-muted-foreground text-xs">
        {firstName} sees your messages, and that you looked at their number, in their inbox.
      </p>
    </div>
  );
}
