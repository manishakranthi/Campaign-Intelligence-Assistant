import { PlatformKey } from "./platforms";
import { TICKETS_DATA } from "./mock-data/tickets";

/**
 * Normalized ticket metadata as returned by any ticketing system implementation.
 * This is the source of truth for budget, flight dates, objective, and goal -- none of
 * that lives in the Google Sheet. Status ("new" vs "live") is intentionally NOT part of
 * this shape: it's derived by cross-referencing the data source, see getTicketsWithStatus
 * in campaign-service.ts.
 */
export interface TicketMetadata {
  campaignId: string;
  campaignName: string;
  flightStartDate: string;
  flightEndDate: string;
  overallBudget: number;
  objective: string;
  goal: string;
  goalTypeCode: string;
  goalAmount: number;
  vertical: string;
  platforms: PlatformKey[];
}

export interface TicketingSource {
  listTickets(): Promise<TicketMetadata[]>;
  getTicket(campaignId: string): Promise<TicketMetadata | null>;
}

function normalizeTicket(raw: (typeof TICKETS_DATA)[number]): TicketMetadata {
  return { ...raw, campaignId: String(raw.campaignId) };
}

class MockTicketingSource implements TicketingSource {
  async listTickets(): Promise<TicketMetadata[]> {
    return TICKETS_DATA.map(normalizeTicket);
  }

  async getTicket(campaignId: string): Promise<TicketMetadata | null> {
    const found = TICKETS_DATA.find((t) => String(t.campaignId) === campaignId);
    return found ? normalizeTicket(found) : null;
  }
}

// The real ticketing tool is TBD (Jira/Zendesk/Freshdesk are candidates). Whichever is chosen,
// it should implement TicketingSource and map its native fields onto TicketMetadata -- callers
// never need to know which system is behind the interface.
let cachedSource: TicketingSource | null = null;

export function getTicketingSource(): TicketingSource {
  if (!cachedSource) {
    cachedSource = new MockTicketingSource();
  }
  return cachedSource;
}
