export interface WhatsappProvider {
  send(input: { recipient: string; templateKey: string; variables: Record<string, unknown> }): Promise<{ providerMessageId: string }>;
}

export class MockWhatsappProvider implements WhatsappProvider {
  async send(): Promise<{ providerMessageId: string }> {
    return { providerMessageId: `mock_${crypto.randomUUID()}` };
  }
}

export interface PrinterAdapter {
  print(job: { kind: string; payload: unknown }): Promise<void>;
}

export class LocalDesktopPrinterAdapter implements PrinterAdapter {
  async print(): Promise<void> {
    throw new Error("Desktop printer bridge is not connected");
  }
}
