// Razorpay's checkout (their own secure payment window): loaded only when a visitor donates. The website never sees card
// or bank details — Razorpay's window collects them and returns a signed payment id the API checks.

export interface RazorpayResult { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string; }
export interface RazorpayOrder { orderId: string; keyId: string; amountPaise: number; currency: string; name: string; email: string; phone: string | null; }

interface RazorpayInstance { open(): void; on(event: string, cb: (r: { error?: { description?: string } }) => void): void; }
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;

let loading: Promise<RazorpayCtor> | null = null;

function load(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => w.Razorpay ? resolve(w.Razorpay) : reject(new Error('checkout unavailable'));
    s.onerror = () => { loading = null; reject(new Error('checkout unavailable')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** Opens the checkout; resolves with the signed result, or null when the visitor closed it / the payment failed. */
export async function payWithRazorpay(o: RazorpayOrder, description: string, onFailed: (reason: string) => void): Promise<RazorpayResult | null> {
  const Razorpay = await load();
  return new Promise(resolve => {
    const rzp = new Razorpay({
      key: o.keyId, amount: o.amountPaise, currency: o.currency, order_id: o.orderId,
      name: 'Selfie with Parent', description, image: `${location.origin}/favicon.ico`,
      prefill: { name: o.name, email: o.email, contact: o.phone ?? '' },
      theme: { color: '#f06543' },
      handler: (r: RazorpayResult) => resolve(r),
      modal: { ondismiss: () => resolve(null), confirm_close: true }
    });
    rzp.on('payment.failed', r => onFailed(r.error?.description ?? 'Payment failed'));
    rzp.open();
  });
}
