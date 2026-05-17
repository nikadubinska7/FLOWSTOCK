AI Replenishment Prototype Mock CSV Package

Business setup:
- 1 DC
- 70 owned stores
- 1,200 style-color-size SKUs
- Daily planning
- Weekly store delivery
- Fixed store assortment
- DC-to-store replenishment only

Recommended joins:
- store_inventory.store_id + sku_id -> assortment, forecast_next_28d
- sku_id -> sku_master and dc_inventory
- store_id -> stores and capacity_rules
- sku_id -> promo_calendar

Approval constraint:
Use dc_inventory.dc_free_stock, pack_multiple from sku_master, and manual override comment checks.

Simulation loop:
1. Refresh reads the current CSV package.
2. User runs one smart replenishment scenario or manually changes Final Qty.
3. Approve selected/all validates constraints.
4. Approval creates approval_history rows and shipping/open order rows.
5. Next simulated day:
   - subtract approved qty from dc_free_stock
   - add approved qty to open_orders and/or store in_transit
   - when expected arrival date reaches run_date, move in_transit to stock_on_hand
   - simulate daily sales and subtract from stock_on_hand
   - append sales_history
   - refresh forecast_next_28d
   - create a new dated CSV package
