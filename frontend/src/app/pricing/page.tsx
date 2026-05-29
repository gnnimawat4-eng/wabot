import Link from 'next/link';
import { Check, Zap } from 'lucide-react';

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '₹999',
    badge: null,
    desc: 'Perfect for small businesses',
    features: [
      '1 WhatsApp number',
      '500 conversations/month',
      'Basic automation flows',
      'AI smart replies',
      'Contact management',
      'Email support',
    ],
    cta: 'Get Started',
    highlight: false,
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '₹2,499',
    badge: '⭐ Most Popular',
    desc: 'For growing businesses',
    features: [
      '1 WhatsApp number',
      '2,000 conversations/month',
      'Unlimited flows',
      'AI replies + Analytics',
      'Priority support',
      'Broadcast campaigns',
      'All business templates',
    ],
    cta: 'Get Started',
    highlight: true,
  },
  {
    id: 'agency',
    name: 'Agency',
    price: '₹6,999',
    badge: null,
    desc: 'For large businesses & agencies',
    features: [
      '5 WhatsApp numbers',
      'Unlimited conversations',
      'Multi-agent inbox',
      'Advanced analytics',
      'Dedicated support',
      'White-label option',
      'API access',
    ],
    cta: 'Contact Us',
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#1a1a1a]">
      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-green-500/20 flex items-center justify-center">
            <Zap className="h-4 w-4 text-green-400" />
          </div>
          <span className="text-lg font-bold text-white">WaBot</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-white/50 hover:text-white transition-colors">Sign in</Link>
          <Link href="/signup" className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Start Free Trial
          </Link>
        </div>
      </header>

      {/* Hero */}
      <div className="text-center pt-16 pb-12 px-4">
        <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 text-sm px-4 py-1.5 rounded-full mb-6">
          🎁 7-day free trial — no credit card required
        </div>
        <h1 className="text-4xl font-bold text-white mb-4">Simple, Transparent Pricing</h1>
        <p className="text-white/50 text-lg max-w-lg mx-auto">
          Start free, scale as you grow. All plans include WhatsApp automation, AI replies, and unlimited contacts.
        </p>
      </div>

      {/* Plans */}
      <div className="max-w-5xl mx-auto px-4 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl border p-6 flex flex-col ${
                plan.highlight
                  ? 'border-green-500/40 bg-green-500/5 shadow-xl shadow-green-500/10'
                  : 'border-white/8 bg-white/3'
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-green-500 text-white text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap">
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-5">
                <p className="text-white font-bold text-lg mb-1">{plan.name}</p>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-3xl font-bold text-white">{plan.price}</span>
                  <span className="text-white/40 text-sm">/month</span>
                </div>
                <p className="text-white/50 text-sm">{plan.desc}</p>
              </div>

              <ul className="space-y-2.5 flex-1 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-white/70">
                    <Check className="h-4 w-4 text-green-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href="/signup"
                className={`block text-center py-3 rounded-xl font-semibold text-sm transition-colors ${
                  plan.highlight
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-white/8 hover:bg-white/12 text-white border border-white/10'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* FAQ row */}
        <div className="mt-16 text-center">
          <p className="text-white/30 text-sm">
            All plans include 7-day free trial · No setup fees · Cancel anytime · GST applicable
          </p>
        </div>
      </div>
    </div>
  );
}
