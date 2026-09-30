export * from "./auth";
export * from "./addresses";
export * from "./catalog";
export * from "./cart";
export * from "./delivery";
export * from "./marketing";
export * from "./orders";
export * from "./system";

import * as authSchema from "./auth";
import * as addressesSchema from "./addresses";
import * as catalogSchema from "./catalog";
import * as cartSchema from "./cart";
import * as deliverySchema from "./delivery";
import * as marketingSchema from "./marketing";
import * as orderSchema from "./orders";
import * as systemSchema from "./system";

export const schema = {
  ...authSchema,
  ...addressesSchema,
  ...catalogSchema,
  ...cartSchema,
  ...deliverySchema,
  ...marketingSchema,
  ...orderSchema,
  ...systemSchema,
};
