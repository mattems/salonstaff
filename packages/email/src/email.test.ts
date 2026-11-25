import { describe, expect, it } from "vitest";
import { noticeEmail, signInCodeEmail, smsAsEmail } from "./index";

describe("emails", () => {
  it("puts the code in the subject and both versions", async () => {
    const mail = await signInCodeEmail({ to: "a@b.test", code: "123456", expiresInMinutes: 10 });
    expect(mail.subject).toContain("123456");
    expect(mail.html).toContain("123456");
    expect(mail.text).toContain("123456");
  });

  it("links notices in both versions", async () => {
    const mail = await noticeEmail({
      to: "a@b.test",
      subject: "S",
      title: "T",
      body: "B",
      action: "Open",
      url: "https://x.test/y",
    });
    expect(mail.html).toContain("https://x.test/y");
    expect(mail.text).toContain("https://x.test/y");
  });

  it("addresses local SMS by number", () => {
    expect(smsAsEmail({ phoneNumber: "+61412345678", body: "hi" }).to).toBe(
      "sms+61412345678@local.test",
    );
  });
});
