import { track } from '@vercel/analytics';

export type LandingAction = 'contact' | 'example' | 'merchant_login' | 'demo';
export type LandingPosition = 'header' | 'mobile_menu' | 'hero' | 'product' | 'pilot' | 'final' | 'footer';

const campaignAllowlist = {
  utm_source: ['instagram', 'facebook', 'google', 'whatsapp', 'email', 'direct'],
  utm_medium: ['social', 'cpc', 'organic', 'email', 'referral'],
  utm_campaign: ['piloto', 'encomendas', 'cardapio', 'podevir'],
} as const;

export function trackLandingAction(action: LandingAction, position: LandingPosition) {
  try {
    const properties: Record<string, string> = { action, position };
    const params = new URLSearchParams(window.location.search);
    for (const [key, allowed] of Object.entries(campaignAllowlist)) {
      const value = params.get(key)?.toLowerCase();
      if (value && (allowed as readonly string[]).includes(value)) properties[key] = value;
    }
    track('landing_action', properties);
  } catch {
    // Contact and navigation work even when analytics is blocked or unavailable.
  }
}
