import { describe, expect, it } from "vitest";
import {
  getDataSourceProvider,
  inferDataSource,
  listDataSources,
  resolveDataSnapshot,
} from "../src/lib/server/dataSources";
import { sourceRunsRoot } from "../src/lib/utils/filePaths";
import { selectBusinessCentralCompany } from "../src/lib/server/businessCentral";

describe("data source registry", () => {
  it("publishes ready local sources and a non-runnable Business Central source", async () => {
    const sources = await listDataSources();
    const sportswear = sources.find((source) => source.id === "sportswear-csv");
    const businessCentral = sources.find(
      (source) => source.id === "business-central",
    );
    const databricks = sources.find(
      (source) => source.id === "databricks-sportswear",
    );

    expect(sportswear?.status).toBe("ready");
    expect(sportswear?.defaultSnapshot).toBe("latest");
    expect(sportswear?.snapshots.map((item) => item.id)).toContain(
      "sportswear",
    );
    expect(businessCentral).toMatchObject({
      defaultSnapshot: null,
      snapshots: [],
      capabilities: {
        canPlan: false,
        canSync: false,
      },
    });
    expect(databricks).toBeDefined();
    expect(databricks?.description).toContain("720 SKUs");
  });

  it("keeps snapshots and generated packages within their source", async () => {
    expect(inferDataSource("sportswear")).toBe("sportswear-csv");
    expect(inferDataSource("demo")).toBe("grocery-research");
    expect(sourceRunsRoot("sportswear-csv")).not.toBe(
      sourceRunsRoot("grocery-research"),
    );
    expect(sourceRunsRoot("databricks-sportswear")).not.toBe(
      sourceRunsRoot("sportswear-csv"),
    );
    await expect(
      resolveDataSnapshot("grocery-research", "sportswear"),
    ).rejects.toThrow("INVALID_SOURCE_SNAPSHOT");
    await expect(
      getDataSourceProvider("business-central").resolveSnapshot("latest"),
    ).rejects.toThrow("SOURCE_NOT_CONNECTED");
  });

  it("matches the configured Business Central company by its full name", () => {
    const company = selectBusinessCentralCompany(
      [
        { id: "1", name: "CRONUS USA, Inc.", displayName: "" },
        { id: "2", name: "My Company", displayName: "" },
      ],
      "  cronus USA, Inc. ",
    );
    expect(company?.id).toBe("1");
  });
});
