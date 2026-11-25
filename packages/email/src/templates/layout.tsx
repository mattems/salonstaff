import { Body, Container, Head, Hr, Html, Preview, Text } from "@react-email/components";
import { BRAND } from "@salonstaff/shared";
import type { ReactNode } from "react";

const body = {
  backgroundColor: "#f4f4f5",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  margin: 0,
  padding: "32px 0",
};
const card = {
  backgroundColor: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: "10px",
  margin: "0 auto",
  maxWidth: "480px",
  padding: "32px",
};
const brand = { color: "#18181b", fontSize: "15px", fontWeight: 600, margin: "0 0 24px" };
const footer = { color: "#71717a", fontSize: "12px", lineHeight: "18px", margin: 0 };

/** Shared frame for every email: brand name on top, a quiet footer underneath. */
export function Layout(props: {
  preview: string;
  footer: string;
  /** In place of our own name on top, for mail sent in someone else's name. */
  name?: string;
  children: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{props.preview}</Preview>
      <Body style={body}>
        <Container style={card}>
          <Text style={brand}>{props.name ?? BRAND.name}</Text>
          {props.children}
          <Hr style={{ borderColor: "#e4e4e7", margin: "28px 0 16px" }} />
          <Text style={footer}>{props.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
