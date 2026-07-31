import type { TicketingSource, TicketMetadata } from "./ticketing-source";
import { getUploadedCampaignStore } from "./uploaded-campaign-store";

/** Merges the base TicketingSource (the mock ticketing system) with uploaded-campaign tickets. */
export class CompositeTicketingSource implements TicketingSource {
  constructor(private base: TicketingSource) {}

  async listTickets(): Promise<TicketMetadata[]> {
    const baseTickets = await this.base.listTickets();
    return [...baseTickets, ...(await getUploadedCampaignStore().listTickets())];
  }

  async getTicket(campaignId: string): Promise<TicketMetadata | null> {
    const uploaded = await getUploadedCampaignStore().getTicket(campaignId);
    if (uploaded) return uploaded;
    return this.base.getTicket(campaignId);
  }
}
