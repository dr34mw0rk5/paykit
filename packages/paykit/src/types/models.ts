import type { feature, invoice, product, productFeature, subscription } from "../database/schema";
import type { customer as customerTable } from "../database/schema";

export type Customer = typeof customerTable.$inferSelect;
export type StoredFeature = typeof feature.$inferSelect;
export type StoredProduct = typeof product.$inferSelect;
export type StoredProductFeature = typeof productFeature.$inferSelect;
export type StoredSubscription = typeof subscription.$inferSelect;
export type StoredInvoice = typeof invoice.$inferSelect;
