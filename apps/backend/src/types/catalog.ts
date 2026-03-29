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
}

export interface UpdateCatalogItemBody {
  name?: string;
  unit?: string;
  unitPriceCents?: number;
  tradeCategory?: string;
}
