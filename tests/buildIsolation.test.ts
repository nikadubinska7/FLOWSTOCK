import { describe, expect, it } from "vitest";
import { createRequire } from "module";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants";

const require = createRequire(import.meta.url);
const config = require("../next.config.js");

describe("compiled app isolation", () => {
  it("keeps development assets separate from production build/start", () => {
    const previous = process.env.FLOWSTOCK_DIST_DIR;
    delete process.env.FLOWSTOCK_DIST_DIR;
    try {
      expect(config(PHASE_DEVELOPMENT_SERVER).distDir).toBe(".next-dev");
      expect(config(PHASE_PRODUCTION_BUILD).distDir).toBe(".next");
      expect(config(PHASE_PRODUCTION_SERVER).distDir).toBe(".next");
      process.env.FLOWSTOCK_DIST_DIR = ".next-browser";
      expect(config(PHASE_DEVELOPMENT_SERVER).distDir).toBe(".next-browser");
    } finally {
      if (previous === undefined) delete process.env.FLOWSTOCK_DIST_DIR;
      else process.env.FLOWSTOCK_DIST_DIR = previous;
    }
  });
});
