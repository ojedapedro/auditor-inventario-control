export interface InventoryItem {
  id: string; // usually SKU or Barcode
  sku: string;
  description: string;
  theoreticalQty: number;
  physicalQty: number;
  scannedAt?: string;
}

export enum AuditStatus {
  IDLE = 'IDLE',
  SETUP = 'SETUP',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED'
}

export interface AuditSession {
  id: string;
  storeName: string;
  auditorName: string;
  date: string;
  items: InventoryItem[];
  observations: string;
  status: AuditStatus;
}

export interface HistoryEntry {
  id: string;
  storeName: string;
  date: string;
  auditorName: string;
  totalItems: number;
  totalDiscrepancies: number;
}

export interface User {
  username: string;
  name: string;
  role: string;
}