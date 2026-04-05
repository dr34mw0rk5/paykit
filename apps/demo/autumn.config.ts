import { feature, item, plan } from "atmn";

// Features

export const messages = feature({
  id: "messages",
  name: "Messages",
  type: "metered",
  consumable: true,
});

export const pro_models = feature({
  id: "pro_models",
  name: "Pro Models",
  type: "boolean",
});

export const priority_support = feature({
  id: "priority_support",
  name: "Priority Support",
  type: "boolean",
});

// Plans

export const free = plan({
  id: "free",
  name: "Free",
  autoEnable: true,
  group: "base",
  items: [
    item({
      featureId: messages.id,
      included: 100,
      reset: { interval: "month" },
    }),
  ],
});

export const pro = plan({
  id: "pro",
  name: "Pro",
  group: "base",
  price: {
    amount: 19,
    interval: "month",
  },
  items: [
    item({
      featureId: messages.id,
      included: 2000,
      reset: { interval: "month" },
    }),
    item({
      featureId: pro_models.id,
    }),
  ],
});

export const ultra = plan({
  id: "ultra",
  name: "Ultra",
  group: "base",
  price: {
    amount: 49,
    interval: "month",
  },
  items: [
    item({
      featureId: messages.id,
      included: 10000,
      reset: { interval: "month" },
    }),
    item({
      featureId: pro_models.id,
    }),
    item({
      featureId: priority_support.id,
    }),
  ],
});
