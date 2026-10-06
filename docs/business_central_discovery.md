# Business Central discovery — CRONUS USA, Inc.

## Connection verified

Read-only discovery was verified on 26 September 2026 using OAuth client credentials.

| Setting | Verified value |
|---|---|
| Environment | `Production` |
| Company | `CRONUS USA, Inc.` |
| Other visible company | `My Company` |
| Authentication | Microsoft Entra service-to-service OAuth |

The configured `Sandbox` environment returned `NoEnvironment`. Tenant-wide environment listing returned 401 for this application, but direct access to the `Production` standard API succeeded. No token or client secret is stored in the discovery record.

## Standard API inventory

| Endpoint | Available | Records found | Flowstock relevance |
|---|---:|---:|---|
| `items` | Yes | 80 | Product/SKU identity, category, current company-level inventory, price and cost |
| `itemVariants` | Yes | 3 | Variant codes and descriptions |
| `itemLedgerEntries` | Yes | 826 | Dated item movements, quantities, actual sales and actual cost |
| `locations` | Yes | 8 | Candidate DC/store or warehouse locations |
| `salesOrders` | Yes | 20 | Open customer demand and requested delivery dates |
| `purchaseOrders` | Yes | 14 | Incoming supply and requested receipt dates |
| OData `ItemLedgerEntries` | Yes | 826 | Location code, remaining quantity, UOM, lot and expiration fields missing from the standard API |

The complete item-ledger range is **2024-03-01 to 2026-08-01**. The latest 90-day window, **2026-05-04 to 2026-08-01**, contains **56 ledger entries**. This is a 90-calendar-day slice, not 90 observations for every item or location.

## Mapping assessment

| Flowstock entity | Candidate Business Central source | Status |
|---|---|---|
| SKU master | `items` + `itemVariants` | Available |
| Product category | `items.itemCategoryCode` | Available |
| Unit cost / selling price | `items.unitCost` / `items.unitPrice` | Available |
| Sales and movement history | `itemLedgerEntries` | Partially available |
| Locations | `locations` | Available; business roles still need classification |
| Open demand | `salesOrders` and sales-order lines | Header confirmed; line extraction still required |
| Incoming supply | `purchaseOrders` and purchase-order lines | Header confirmed; line extraction still required |
| Inventory by item and location | Published OData `ItemLedgerEntries` | Technically available, but location use is sparse |
| Store assortment | No direct standard source confirmed | Requires derivation or configuration |
| Store/SKU and category capacity | No direct standard source confirmed | Requires configuration |
| Promotions and demand forecast | No direct standard source confirmed | Requires derivation or configuration |
| Routes and delivery calendars | No direct standard source confirmed | Requires configuration |

The standard `itemLedgerEntries` response does not contain location code, remaining quantity or variant code. The tenant already publishes an OData `ItemLedgerEntries` service containing `Location_Code`, `Remaining_Quantity`, unit-of-measure, lot and expiration fields, so a custom Business Central extension is not currently required.

## Location suitability

Eight locations are defined: East Warehouse, Main Warehouse, Outsourced Logistics, Own Logistics, Silver Warehouse, West Warehouse, White Warehouse and Yellow Warehouse. Actual item-ledger use is highly concentrated:

| Ledger location | Entries | Entries in latest 90-day window | Remaining units | Items with a balance |
|---|---:|---:|---:|---:|
| Blank location | 798 | 56 | 11,518 | 37 |
| MAIN | 23 | 0 | 2,121 | 22 |
| WEST | 2 | 0 | 6 | 1 |
| EAST | 1 | 0 | 3 | 1 |
| OUT. LOG. | 2 | 0 | 0 | 0 |

The other defined locations have no item-ledger entries. This CRONUS company therefore does not currently behave like a DC supplying active retail stores. All 56 entries in the latest 90-day slice use a blank location. An import can reproduce these facts, but it cannot create meaningful store-level replenishment recommendations without an explicit modelling decision or additional data.

## Current connector behavior

- **Test connection** acquires a short-lived token in memory, verifies the configured environment and company, probes the required standard endpoints, and records only non-secret discovery metadata.
- **Sync data** remains disabled pending the location/business-role decision.
- **Generate recommended plan** remains disabled for Business Central because no canonical Flowstock snapshot has been created.
- Sportswear and grocery snapshots, histories and generated packages remain isolated from Business Central.
