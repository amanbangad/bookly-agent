// Bookly's policy knowledge base. In production this would live in a CMS or
// help-center export; here it's a small fixed set. Each doc is embedded once
// (see scripts/seed.ts) so the agent can retrieve the relevant policy instead
// of answering shipping/returns/password questions from the model's memory.

export type PolicyDoc = { id: string; title: string; body: string };

export const POLICY_DOCS: PolicyDoc[] = [
  {
    id: "shipping",
    title: "Shipping & Delivery",
    body: `Bookly ships within the US and Canada. Standard shipping is free on orders over $35 and takes 5-7 business days. Express shipping is $9.99 and takes 2-3 business days. Orders are processed within 1 business day. Once an order ships, a tracking number is emailed to the address on the order. Bookly does not currently ship internationally outside the US and Canada.`,
  },
  {
    id: "returns",
    title: "Returns",
    body: `Books can be returned within 30 days of delivery for a full refund as long as they are in original condition. Damaged or defective items can be returned at any time and Bookly covers return shipping. To start a return, the customer provides their order number and the reason. Bookly issues a prepaid return label by email. Refunds are processed to the original payment method once the return is received, typically within 5 business days.`,
  },
  {
    id: "refunds",
    title: "Refunds",
    body: `Refunds are issued to the original payment method. Standard refunds (for returns in good standing) are processed automatically. Refunds above $100, refunds requested without a return, or refunds on orders older than 90 days are reviewed by a support specialist before being issued. Customers typically see refunded funds within 5-10 business days depending on their bank.`,
  },
  {
    id: "password-reset",
    title: "Password Reset & Account Access",
    body: `To reset a Bookly account password, go to bookly.com/login and click "Forgot password." A reset link is emailed to the address on file and is valid for 60 minutes. If the customer no longer has access to their email, they must contact support to verify their identity before the email on file can be changed. Bookly support agents can never see or set a customer's password.`,
  },
  {
    id: "payment",
    title: "Payment Methods",
    body: `Bookly accepts Visa, Mastercard, American Express, Discover, and Bookly gift cards. Payment is charged when the order ships, not when it is placed. Bookly does not store full card numbers. Gift card balances never expire and can be combined with a credit card at checkout.`,
  },
  {
    id: "contact",
    title: "Contacting Support",
    body: `Bookly support is available by chat 24/7 and by email at help@bookly.com. Live human agents are available 9am-6pm ET, Monday through Friday. For order-specific questions, customers should have their order number ready. Complex issues are escalated to a human specialist who responds by email within one business day.`,
  },
];
