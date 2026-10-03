export interface WhatsappProvider {
  send(input: { recipient: string; templateKey: string; variables: Record<string, unknown> }): Promise<{ providerMessageId: string }>;
}

export class MockWhatsappProvider implements WhatsappProvider {
  async send(_input: { recipient: string; templateKey: string; variables: Record<string, unknown> }): Promise<{ providerMessageId: string }> {
    return { providerMessageId: `mock_${crypto.randomUUID()}` };
  }
}

export type MetaWhatsappConfig = { accessToken: string; phoneNumberId: string; graphVersion: string; languageCode: string };

export class MetaWhatsappProvider implements WhatsappProvider {
  constructor(private readonly settings: MetaWhatsappConfig) {}

  async send(input: { recipient: string; templateKey: string; variables: Record<string, unknown> }): Promise<{ providerMessageId: string }> {
    if (!this.settings.accessToken || !this.settings.phoneNumberId) throw new Error("Meta WhatsApp provider is not configured");
    const parameters = Object.values(input.variables).filter((value) => ["string", "number", "boolean"].includes(typeof value)).map((value) => ({ type: "text", text: String(value) }));
    const response = await fetch(`https://graph.facebook.com/${this.settings.graphVersion}/${this.settings.phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.settings.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: input.recipient.replace(/^\+/, ""), type: "template", template: { name: input.templateKey, language: { code: this.settings.languageCode }, ...(parameters.length ? { components: [{ type: "body", parameters }] } : {}) } }),
    });
    const body = await response.json() as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
    if (!response.ok || !body.messages?.[0]?.id) throw new Error(`Meta WhatsApp send failed (${body.error?.code ?? response.status}): ${body.error?.message ?? "unknown error"}`);
    return { providerMessageId: body.messages[0].id };
  }

  async testConnection(): Promise<{ phoneNumberId: string; displayPhoneNumber?: string; verifiedName?: string }> {
    if (!this.settings.accessToken || !this.settings.phoneNumberId) throw new Error("Meta WhatsApp provider is not configured");
    const response = await fetch(`https://graph.facebook.com/${this.settings.graphVersion}/${this.settings.phoneNumberId}?fields=display_phone_number,verified_name`, { headers: { authorization: `Bearer ${this.settings.accessToken}` } });
    const body = await response.json() as { id?: string; display_phone_number?: string; verified_name?: string; error?: { message?: string; code?: number } };
    if (!response.ok || !body.id) throw new Error(`Meta WhatsApp connection failed (${body.error?.code ?? response.status}): ${body.error?.message ?? "unknown error"}`);
    return { phoneNumberId: body.id, displayPhoneNumber: body.display_phone_number, verifiedName: body.verified_name };
  }
}

export interface PrinterAdapter {
  print(job: { kind: string; payload: unknown }): Promise<void>;
}
export function whatsappReadiness(settings: { provider: "mock" | "meta"; accessToken: string; phoneNumberId: string; appSecret: string; verifyToken: string }, production: boolean) {
  const missing = settings.provider === "meta" ? [!settings.accessToken && "META_WHATSAPP_ACCESS_TOKEN", !settings.phoneNumberId && "META_WHATSAPP_PHONE_NUMBER_ID", !settings.appSecret && "META_WHATSAPP_APP_SECRET", !settings.verifyToken && "META_WHATSAPP_VERIFY_TOKEN"].filter(Boolean) as string[] : production ? ["WHATSAPP_PROVIDER=meta"] : [];
  const status = settings.provider === "mock" ? (production ? "NOT_CONFIGURED" : "TEST") : missing.length ? "ERROR" : "META_READY";
  return { status, provider: settings.provider, missing, canSend: !production ? true : status === "META_READY" } as const;
}
