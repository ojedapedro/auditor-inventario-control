import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AuditSession, HistoryEntry, InventoryItem } from '../types';

const STORAGE_KEY = 'audit_history';
const LOGO_URL = "https://i.ibb.co/hFq3BtD9/Movilnet-logo-0.png";

export const AuditService = {
  // --- Excel Processing ---
  parseExcel: async (file: File): Promise<InventoryItem[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(sheet);

          const items: InventoryItem[] = jsonData.map((row: any) => ({
            id: String(row['SKU'] || row['Codigo'] || row['Code'] || row['Barcode'] || Math.random().toString(36).substr(2, 9)),
            sku: String(row['SKU'] || row['Codigo'] || row['Code'] || row['Barcode'] || 'UNKNOWN'),
            description: String(row['Descripcion'] || row['Description'] || row['Nombre'] || 'Sin descripción'),
            theoreticalQty: Number(row['Cantidad'] || row['Qty'] || row['Teorico'] || 0),
            physicalQty: 0, // Initialize with 0
          }));

          resolve(items);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsBinaryString(file);
    });
  },

  // --- PDF Generation ---
  generatePDF: (session: AuditSession) => {
    const doc = new jsPDF();

    // Header
    const imgProps = doc.getImageProperties(LOGO_URL);
    const imgWidth = 40;
    const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
    doc.addImage(LOGO_URL, 'PNG', 14, 10, imgWidth, imgHeight);

    doc.setFontSize(20);
    doc.setTextColor(0, 51, 153); // Corporate Blue
    doc.text("Informe de Auditoría de Inventario", 14, 40);

    // Metadata
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Fecha: ${new Date(session.date).toLocaleString()}`, 14, 50);
    doc.text(`Tienda: ${session.storeName}`, 14, 55);
    doc.text(`Responsable: ${session.auditorName}`, 14, 60);

    // Observations
    if (session.observations) {
      doc.text(`Observaciones: ${session.observations}`, 14, 70);
    }

    // Stats
    const discrepancies = session.items.filter(i => i.theoreticalQty !== i.physicalQty);
    const totalDiscrepancyCount = discrepancies.length;
    
    doc.text(`Total Items: ${session.items.length}`, 150, 50);
    doc.text(`Incidencias: ${totalDiscrepancyCount}`, 150, 55);

    // Table
    const tableData = session.items.map(item => [
      item.sku,
      item.description,
      item.theoreticalQty,
      item.physicalQty,
      item.physicalQty - item.theoreticalQty
    ]);

    autoTable(doc, {
      startY: 80,
      head: [['SKU', 'Descripción', 'Teórico', 'Físico', 'Diferencia']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [0, 51, 153] },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const val = Number(data.cell.raw);
          if (val < 0) data.cell.styles.textColor = [220, 38, 38]; // Red
          if (val > 0) data.cell.styles.textColor = [22, 163, 74]; // Green
        }
      }
    });

    doc.save(`Auditoria_${session.storeName}_${new Date().toISOString().split('T')[0]}.pdf`);
  },

  // --- History Management ---
  saveToHistory: (session: AuditSession) => {
    const history = AuditService.getHistory();
    const discrepancies = session.items.filter(i => i.theoreticalQty !== i.physicalQty).length;
    
    const entry: HistoryEntry = {
      id: session.id,
      storeName: session.storeName,
      date: session.date,
      auditorName: session.auditorName,
      totalItems: session.items.length,
      totalDiscrepancies: discrepancies
    };

    const newHistory = [entry, ...history].slice(0, 5); // Keep last 5
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
  },

  getHistory: (): HistoryEntry[] => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  }
};