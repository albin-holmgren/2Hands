type Reference = string | { id?: string } | null;
type InvoiceLine = {
  period?: { start?: number; end?: number };
  price?: { id?: string } | null;
  pricing?: { price_details?: { price?: Reference } | null } | null;
  proration?: boolean;
  subscription_item?: Reference;
  parent?: {
    subscription_item_details?: { subscription_item?: Reference; proration?: boolean } | null;
  } | null;
};

export type PaidPeriodInvoice = {
  status?: string | null;
  subscription?: Reference;
  parent?: { subscription_details?: { subscription?: Reference } | null } | null;
  lines?: { data?: InvoiceLine[]; has_more?: boolean };
};

const id = (value: Reference | undefined) => (typeof value === "string" ? value : value?.id);

/** A previous paid invoice cannot fund a new phase before its own invoice is paid. */
export function invoiceConfirmsSubscriptionPeriod(
  invoice: PaidPeriodInvoice | string | null | undefined,
  period: {
    subscriptionId: string;
    itemId?: string;
    priceId?: string;
    start?: number;
    end?: number;
  },
) {
  if (
    !invoice ||
    typeof invoice === "string" ||
    invoice.status !== "paid" ||
    !period.itemId ||
    !period.priceId ||
    !period.start ||
    !period.end ||
    period.end <= period.start ||
    (id(invoice.subscription) ?? id(invoice.parent?.subscription_details?.subscription)) !==
      period.subscriptionId ||
    invoice.lines?.has_more
  )
    return false;
  return (
    invoice.lines?.data?.some((line) => {
      const details = line.parent?.subscription_item_details;
      return (
        (id(line.subscription_item) ?? id(details?.subscription_item)) === period.itemId &&
        (line.price?.id ?? id(line.pricing?.price_details?.price)) === period.priceId &&
        (line.proration ?? details?.proration) === false &&
        line.period?.start === period.start &&
        line.period?.end === period.end
      );
    }) ?? false
  );
}
