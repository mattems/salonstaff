import { Button } from "@salonstaff/ui/components/button";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/** A small button that copies `value`. `label` says what, for screen readers: "Copy email address". */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Select it and copy it yourself.");
    }
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="text-muted-foreground"
      aria-label={copied ? "Copied" : label}
      onClick={copy}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}
