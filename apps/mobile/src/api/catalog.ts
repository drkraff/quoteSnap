import { apiClient } from './client';

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

interface CatalogListResponse {
  items: CatalogItemResponse[];
}

interface CatalogCreateResponse {
  item: CatalogItemResponse;
}

export async function fetchCatalogItems(): Promise<CatalogItemResponse[]> {
  const data = await apiClient.get<CatalogListResponse>('/catalog');
  return data.items;
}

export async function createCatalogItem(body: {
  name: string;
  unit: string;
  unitPriceCents: number;
  tradeCategory?: string;
}): Promise<CatalogItemResponse> {
  const data = await apiClient.post<CatalogCreateResponse>('/catalog', body);
  return data.item;
}

export async function updateCatalogItem(
  serverId: string,
  body: { name?: string; unit?: string; unitPriceCents?: number },
): Promise<CatalogItemResponse> {
  const data = await apiClient.put<CatalogCreateResponse>(`/catalog/${serverId}`, body);
  return data.item;
}

export async function archiveCatalogItem(serverId: string): Promise<void> {
  await apiClient.patch<{ archived: boolean }>(`/catalog/${serverId}/archive`);
}
