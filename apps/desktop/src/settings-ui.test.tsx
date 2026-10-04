import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LogoPicker } from "./settings-ui";

describe("settings logo picker", () => {
  it("shows a visual preview and never puts the data URL in a text input", () => { const html = renderToStaticMarkup(<LogoPicker value="data:image/png;base64,AA==" onChange={() => undefined} />); expect(html).toContain("<img"); expect(html).toContain('type="file"'); expect(html).not.toContain('type="text"'); });
});
