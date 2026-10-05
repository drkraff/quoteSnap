export interface CatalogItemResponse {
  id: string;
  name: string;
  unit: string;
  unitPriceCents: number;
  tradeCategory: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCatalogItemBody {
  name: string;
  unit: string;
  unitPriceCents: number;
  tradeCategory?: string;
  /** Mobile local row id. A repeat POST returns the first row and its cents. */
  clientKey?: string;
}

export interface UpdateCatalogItemBody {
  name?: string;
  unit?: string;
  unitPriceCents?: number;
  tradeCategory?: string;
}

/** PATCH /catalog/:id/archive — omit or true archives; false unarchives (A-05). */
export interface ArchiveCatalogItemBody {
  archived?: boolean;
}
