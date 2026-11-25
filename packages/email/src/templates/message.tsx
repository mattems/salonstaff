import { Button, Heading, Link, Text } from "@react-email/components";
import { Layout } from "./layout";

const heading = { color: "#18181b", fontSize: "20px", fontWeight: 600, margin: "0 0 12px" };
const paragraph = { color: "#3f3f46", fontSize: "14px", lineHeight: "22px", margin: "0 0 20px" };
const button = {
  backgroundColor: "#18181b",
  borderRadius: "8px",
  color: "#fafafa",
  fontSize: "14px",
  fontWeight: 500,
  padding: "10px 18px",
  textDecoration: "none",
};
const small = { color: "#71717a", fontSize: "12px", lineHeight: "18px", margin: "20px 0 0" };

/** One message, one button: every email that asks the reader to do something. */
export function Message(props: {
  preview: string;
  title: string;
  body: string;
  action: string;
  url: string;
  footer: string;
}) {
  return (
    <Layout preview={props.preview} footer={props.footer}>
      <Heading style={heading}>{props.title}</Heading>
      <Text style={paragraph}>{props.body}</Text>
      <Button href={props.url} style={button}>
        {props.action}
      </Button>
      <Text style={small}>
        If the button doesn't work, open this link: <Link href={props.url}>{props.url}</Link>
      </Text>
    </Layout>
  );
}

export const text = (lines: string[]) => lines.join("\n");
