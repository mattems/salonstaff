import { Heading, Text } from "@react-email/components";
import { render } from "@react-email/render";
import { BRAND } from "@salonstaff/shared";
import type { EmailMessage } from "../sender";
import { Layout } from "./layout";
import { Message, text } from "./message";

const heading = { color: "#18181b", fontSize: "20px", fontWeight: 600, margin: "0 0 12px" };
const code = {
  color: "#18181b",
  fontSize: "32px",
  fontWeight: 700,
  letterSpacing: "8px",
  margin: "8px 0 20px",
};
const paragraph = { color: "#3f3f46", fontSize: "14px", lineHeight: "22px", margin: "0 0 12px" };

/**
 * The six-digit sign-in (or sign-up) code, or with `purpose: "change-email"` the code that makes
 * this the account's new address.
 */
export async function signInCodeEmail(props: {
  to: string;
  code: string;
  expiresInMinutes: number;
  purpose?: "sign-in" | "change-email";
}): Promise<EmailMessage> {
  const changing = props.purpose === "change-email";
  const title = changing ? `Confirm your new ${BRAND.name} email` : `Your ${BRAND.name} code`;
  const body = changing
    ? `Enter this code to make this your ${BRAND.name} email address. It expires in ${props.expiresInMinutes} minutes.`
    : `Enter this code to sign in. It expires in ${props.expiresInMinutes} minutes.`;
  const footer = changing
    ? "If you didn't ask for this, ignore this email: nothing changes without the code."
    : "If you didn't ask for this code, ignore this email: nobody can sign in without it.";
  return {
    to: props.to,
    subject: `${props.code} is your ${BRAND.name} code`,
    html: await render(
      <Layout preview={`${props.code} is your code`} footer={footer}>
        <Heading style={heading}>{title}</Heading>
        <Text style={paragraph}>{body}</Text>
        <Text style={code}>{props.code}</Text>
      </Layout>,
    ),
    text: text([title, "", body, "", props.code, "", footer]),
  };
}

/** A notice with one button: applications, claims, status changes, checks. */
export async function noticeEmail(props: {
  to: string;
  subject: string;
  title: string;
  body: string;
  action: string;
  url: string;
  footer?: string;
}): Promise<EmailMessage> {
  const footer = props.footer ?? `You received this because you have a ${BRAND.name} account.`;
  return {
    to: props.to,
    subject: props.subject,
    html: await render(
      <Message
        preview={props.title}
        title={props.title}
        body={props.body}
        action={props.action}
        url={props.url}
        footer={footer}
      />,
    ),
    text: text([props.title, "", props.body, "", props.url, "", footer]),
  };
}

/**
 * Local development only: an SMS delivered to Mailpit as an email to `sms+<number>@local.test`,
 * so every code (email or SMS) is in one inbox.
 */
export function smsAsEmail(props: { phoneNumber: string; body: string }): EmailMessage {
  return {
    to: `sms+${props.phoneNumber.replace(/[^\d]/g, "")}@local.test`,
    subject: `SMS to ${props.phoneNumber}`,
    html: `<pre>${props.body.replace(/</g, "&lt;")}</pre>`,
    text: props.body,
  };
}
