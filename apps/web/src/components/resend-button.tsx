import { useEffect, useState } from "react";
import { Button } from "@edicthq/ui";
import { secondsLeft } from "../lib/email-flow.js";
import { FormError } from "./shell.js";

// "Send it again" for an email that just went out: it waits out a 60-second
// cooldown, counting down, before it can send again.
export function ResendButton({
  send,
  coolingFromStart = true,
}: {
  // Sends the email again; answers with the error, if any.
  send: () => Promise<{ error?: { message?: string } | null }>;
  // Whether the email just went out, so the cooldown runs from the start.
  coolingFromStart?: boolean;
}) {
  const [startedAt, setStartedAt] = useState<number | null>(() => (coolingFromStart ? Date.now() : null));
  const [now, setNow] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const [resent, setResent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const left = secondsLeft(startedAt, now);

  useEffect(() => {
    if (left === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [left]);

  const onClick = async () => {
    setFailure(null);
    setSending(true);
    const { error } = await send();
    setSending(false);
    if (error) {
      setFailure(error.message ?? "Sending it again failed. Try again in a minute.");
      return;
    }
    setResent(true);
    const at = Date.now();
    setStartedAt(at);
    setNow(at);
  };

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="lg" disabled={sending || left > 0} onClick={() => void onClick()}>
        {sending ? "Sending…" : left > 0 ? `Send it again in ${left}s` : "Send it again"}
      </Button>
      <p aria-live="polite" className="text-center text-ui text-ink-2">
        {resent && !sending ? "Sent again. It can take a minute to arrive." : ""}
      </p>
      <FormError message={failure} />
    </div>
  );
}
