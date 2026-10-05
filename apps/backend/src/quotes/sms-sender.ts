/**
 * SMS transport for quote approval links.
 * The only implementation in this tree is dry-run/log. Twilio is not wired.
 */

import { redactString } from "../log/redact.js";

export type SmsQuoteLink = {
  toPhone: string;
  approvalUrl: string;
  quoteId: string;
};

export type SmsSendResult = {
  mode: "dry-run";
};

export interface SmsSender {
  readonly mode: "dry-run";
  sendQuoteLink(message: SmsQuoteLink): Promise<SmsSendResult>;
}

export const SMS_TRANSPORT_UNAVAILABLE_ERROR = "SMS transport is not available";

const DRY_RUN_VALUES = new Set(["", "dry-run", "log"]);

export function redactPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const tail = digits.slice(-4);
  return tail.length > 0 ? `***${tail}` : "***";
}

export function createDryRunSmsSender(
  log: (line: string) => void = console.info,
): SmsSender {
  return {
    mode: "dry-run",
    async sendQuoteLink(message: SmsQuoteLink): Promise<SmsSendResult> {
      log(
        redactString(
          `[sms:dry-run] quote=${message.quoteId} to=${redactPhone(message.toPhone)} url=${message.approvalUrl}`,
        ),
      );
      return { mode: "dry-run" };
    },
  };
}

/**
 * SMS_SENDER selects the transport. Unset, dry-run, and log use the logger.
 * Any other value is refused so this process cannot pretend to deliver SMS.
 */
export function resolveSmsSender(
  envValue: string | undefined,
  log: (line: string) => void = console.info,
): { ok: true; sender: SmsSender } | { ok: false; error: string } {
  const value = envValue === undefined ? "" : envValue.trim().toLowerCase();
  if (DRY_RUN_VALUES.has(value)) {
    return { ok: true, sender: createDryRunSmsSender(log) };
  }
  return { ok: false, error: SMS_TRANSPORT_UNAVAILABLE_ERROR };
}
