export interface MetaAudienceInsight {
  label: string;
  detail: string;
}

interface VerticalProfile {
  match: RegExp;
  insights: MetaAudienceInsight[];
}

/**
 * Canned Meta Audience Insight profiles keyed by vertical keyword. This is a placeholder for the
 * real Meta Marketing API (Graph API /act_{ad_account_id}/insights or interest/targeting browse
 * endpoints) -- see getMetaAudienceInsights in trends-source.ts for what real access requires.
 */
const VERTICAL_PROFILES: VerticalProfile[] = [
  {
    match: /fitness/i,
    insights: [
      { label: "Top interest overlap", detail: "Athleisure, running, home workouts" },
      { label: "Age skew", detail: "25-34 (34%), 18-24 (26%)" },
      { label: "Device", detail: "82% mobile placements outperform desktop on CTR" },
      { label: "Lookalike opportunity", detail: "1% lookalike of past 180-day purchasers" },
    ],
  },
  {
    match: /\bb2b\b|saas|cybersecurity/i,
    insights: [
      { label: "Top interest overlap", detail: "Enterprise software, IT management, business technology" },
      { label: "Job title skew", detail: "Director/VP-level (41%), Manager (29%)" },
      { label: "Company size", detail: "201-1000 employees indexes highest for engagement" },
      { label: "Lookalike opportunity", detail: "1% lookalike of webinar registrants" },
    ],
  },
  {
    match: /fintech/i,
    insights: [
      { label: "Top interest overlap", detail: "Budgeting apps, personal investing, financial wellness content" },
      { label: "Age skew", detail: "25-40 (54%)" },
      { label: "Device", detail: "Mobile-first app install flow -- prioritize mobile placements" },
      { label: "Lookalike opportunity", detail: "1% lookalike of app install + activation users" },
    ],
  },
  {
    match: /beauty|skincare/i,
    insights: [
      { label: "Top interest overlap", detail: "Clean beauty, skincare routines, dermatology content" },
      { label: "Age skew", detail: "25-44 (52%)" },
      { label: "Format signal", detail: "Reels/short-form video outperforms static by CTR" },
      { label: "Lookalike opportunity", detail: "1% lookalike of email subscribers" },
    ],
  },
  {
    match: /automotive|ev\b|electric vehicle/i,
    insights: [
      { label: "Top interest overlap", detail: "Sustainable living, EV charging, automotive technology" },
      { label: "Age skew", detail: "35-54 (44%)" },
      { label: "Household income", detail: "Top 25% income bracket indexes 1.6x" },
      { label: "Lookalike opportunity", detail: "1% lookalike of dealership site visitors" },
    ],
  },
  {
    match: /pet/i,
    insights: [
      { label: "Top interest overlap", detail: "Pet ownership, animal welfare, pet subscription boxes" },
      { label: "Age skew", detail: "25-44 (48%)" },
      { label: "Household signal", detail: "Multi-pet households index 1.4x on engagement" },
      { label: "Lookalike opportunity", detail: "1% lookalike of repeat purchasers" },
    ],
  },
  {
    match: /education|mba/i,
    insights: [
      { label: "Top interest overlap", detail: "Career development, professional certifications, online learning" },
      { label: "Age skew", detail: "28-40 (46%)" },
      { label: "Job status", detail: "Employed full-time, considering career change indexes highest" },
      { label: "Lookalike opportunity", detail: "1% lookalike of info-session attendees" },
    ],
  },
  {
    match: /food|beverage|meal|delivery/i,
    insights: [
      { label: "Top interest overlap", detail: "Home cooking, meal planning, food delivery apps" },
      { label: "Age skew", detail: "25-44 (50%)" },
      { label: "Format signal", detail: "Video (recipe-style) outperforms static by hook rate" },
      { label: "Lookalike opportunity", detail: "1% lookalike of trial-to-paid converters" },
    ],
  },
  {
    match: /wellness|travel|retreat/i,
    insights: [
      { label: "Top interest overlap", detail: "Mindfulness, boutique travel, wellness retreats" },
      { label: "Age skew", detail: "30-49 (45%)" },
      { label: "Household income", detail: "Top 30% income bracket indexes 1.5x" },
      { label: "Lookalike opportunity", detail: "1% lookalike of past retreat bookers" },
    ],
  },
  {
    match: /health|telehealth/i,
    insights: [
      { label: "Top interest overlap", detail: "Telemedicine, preventive health, health insurance" },
      { label: "Age skew", detail: "30-54 (49%)" },
      { label: "Device", detail: "Mobile-first booking flow -- prioritize mobile placements" },
      { label: "Lookalike opportunity", detail: "1% lookalike of completed-signup users" },
    ],
  },
  {
    match: /luxury/i,
    insights: [
      { label: "Top interest overlap", detail: "Premium/luxury goods, high-end retail, exclusive releases" },
      { label: "Household income", detail: "Top 20% income bracket indexes 1.7x" },
      { label: "Seasonality", detail: "Engagement climbs sharply in the 6 weeks before major gifting holidays" },
      { label: "Lookalike opportunity", detail: "1% lookalike of past 365-day purchasers" },
    ],
  },
  {
    match: /home goods/i,
    insights: [
      { label: "Top interest overlap", detail: "Interior design, home renovation, seasonal decor" },
      { label: "Age skew", detail: "30-49 (47%)" },
      { label: "Household signal", detail: "Recent movers/homeowners index 1.5x on engagement" },
      { label: "Lookalike opportunity", detail: "1% lookalike of past purchasers" },
    ],
  },
  {
    match: /apparel|footwear|outdoor|retail/i,
    insights: [
      { label: "Top interest overlap", detail: "Seasonal fashion, outerwear/style guides, retail deals" },
      { label: "Age skew", detail: "25-44 (46%)" },
      { label: "Seasonality", detail: "Engagement climbs sharply in the weeks around the seasonal launch window" },
      { label: "Lookalike opportunity", detail: "1% lookalike of past 180-day purchasers" },
    ],
  },
];

const DEFAULT_PROFILE: MetaAudienceInsight[] = [
  { label: "Top interest overlap", detail: "General consumer shopping and category-adjacent interests" },
  { label: "Age skew", detail: "25-44 indexes highest for engagement" },
  { label: "Device", detail: "Mobile placements outperform desktop on CTR" },
  { label: "Lookalike opportunity", detail: "1% lookalike of site visitors or past purchasers" },
];

export function getMockMetaAudienceInsights(vertical: string): MetaAudienceInsight[] {
  const profile = VERTICAL_PROFILES.find((p) => p.match.test(vertical));
  return profile ? profile.insights : DEFAULT_PROFILE;
}
