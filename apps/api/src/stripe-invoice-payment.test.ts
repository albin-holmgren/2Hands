import { describe, expect, it } from "vitest";
import {
  invoiceConfirmsSubscriptionPeriod,
  type PaidPeriodInvoice,
} from "./stripe-invoice-payment.js";

const period = {
  subscriptionId: "sub-example",
  itemId: "si-example",
  priceId: "price-pro",
  start: 1000,
  end: 2000,
};
function invoice(): PaidPeriodInvoice {
  return {
    status: "paid",
    parent: { subscription_details: { subscription: "sub-example" } },
    lines: {
      has_more: false,
      data: [
        {
          parent: {
            subscription_item_details: { subscription_item: "si-example", proration: false },
          },
          pricing: { price_details: { price: "price-pro" } },
          period: { start: 1000, end: 2000 },
        },
      ],
    },
  };
}

describe("paid invoice period evidence", () => {
  it("accepts the paid full-period item using current or legacy Stripe field shapes", () => {
    expect(invoiceConfirmsSubscriptionPeriod(invoice(), period)).toBe(true);
    expect(
      invoiceConfirmsSubscriptionPeriod(
        {
          status: "paid",
          subscription: "sub-example",
          lines: {
            data: [
              {
                subscription_item: "si-example",
                proration: false,
                price: { id: "price-pro" },
                period: { start: 1000, end: 2000 },
              },
            ],
          },
        },
        period,
      ),
    ).toBe(true);
  });

  it.each([
    "prior-period",
    "old-plan",
    "proration",
    "other-subscription",
    "other-item",
    "truncated",
    "no-lines",
    "unpaid",
  ])("rejects %s evidence", (kind) => {
    const value = invoice();
    const line = value.lines!.data![0]!;
    if (kind === "prior-period") line.period = { start: 1, end: 1000 };
    if (kind === "old-plan") line.pricing!.price_details!.price = "price-plus";
    if (kind === "proration") line.parent!.subscription_item_details!.proration = true;
    if (kind === "other-subscription")
      value.parent!.subscription_details!.subscription = "sub-other";
    if (kind === "other-item")
      line.parent!.subscription_item_details!.subscription_item = "si-other";
    if (kind === "truncated") value.lines!.has_more = true;
    if (kind === "no-lines") value.lines!.data = [];
    if (kind === "unpaid") value.status = "open";
    expect(invoiceConfirmsSubscriptionPeriod(value, period)).toBe(false);
  });
});
