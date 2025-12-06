import React, { useState, useEffect, useRef } from 'react';
import { Upload, Barcode, FileText, History, CheckCircle, AlertTriangle, User, MapPin, Save, X, RotateCcw, Search, Lock, LogOut, ArrowRight } from 'lucide-react';
import { AuditService } from './services/auditService';
import { AuditSession, AuditStatus, InventoryItem, HistoryEntry, User as UserType } from './types';

// Helper component for Cards
const Card = ({ children, className = '' }: { children?: React.ReactNode; className?: string }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${className}`}>
    {children}
  </div>
);

export default function App() {
  // Auth State
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // App State
  const [status, setStatus] = useState<AuditStatus>(AuditStatus.IDLE);
  const [sessionData, setSessionData] = useState<Partial<AuditSession>>({});
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  
  // Scanner State
  const [barcodeInput, setBarcodeInput] = useState('');
  const [lastScanned, setLastScanned] = useState<InventoryItem | null>(null);
  const [lastQtyAdded, setLastQtyAdded] = useState<number>(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setHistory(AuditService.getHistory());
  }, []);

  // Ensure focus on input during audit
  useEffect(() => {
    if (status === AuditStatus.ACTIVE) {
      inputRef.current?.focus();
    }
  }, [status, lastScanned]);

  // Auto-fill auditor name when setting up
  useEffect(() => {
    if (status === AuditStatus.SETUP && currentUser && !sessionData.auditorName) {
      setSessionData(prev => ({ ...prev, auditorName: currentUser.name }));
    }
  }, [status, currentUser]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Mock Authentication Logic
    if (loginUsername.toLowerCase() === 'admin' && loginPassword === '1234') {
      setCurrentUser({
        username: 'admin',
        name: 'Administrador Principal',
        role: 'Auditor Senior'
      });
      setLoginError('');
    } else if (loginUsername !== '' && loginPassword !== '') {
       // Allow other users for demo purposes if not empty
       setCurrentUser({
        username: loginUsername,
        name: loginUsername.charAt(0).toUpperCase() + loginUsername.slice(1),
        role: 'Auditor'
      });
      setLoginError('');
    } else {
      setLoginError('Credenciales inválidas. Intente nuevamente.');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    resetApp();
    setLoginUsername('');
    setLoginPassword('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const parsedItems = await AuditService.parseExcel(e.target.files[0]);
        setItems(parsedItems);
      } catch (err) {
        alert("Error al leer el archivo Excel. Asegúrate de tener columnas como 'SKU', 'Descripcion', 'Cantidad'.");
      }
    }
  };

  const startAudit = () => {
    if (!sessionData.storeName || !sessionData.auditorName || items.length === 0) {
      alert("Por favor completa todos los campos y carga el inventario.");
      return;
    }
    
    setStatus(AuditStatus.ACTIVE);
    setSessionData({
      ...sessionData,
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString(),
      status: AuditStatus.ACTIVE
    });
  };

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput) return;

    let searchInput = barcodeInput.trim();
    let quantityToAdd = 1;
    let foundIndex = -1;

    // Helper to find item index
    const findItemIndex = (code: string) => items.findIndex(i => 
      i.sku.toLowerCase() === code.toLowerCase() || 
      i.id.toLowerCase() === code.toLowerCase()
    );

    // Strategy 1: Exact Match (Qty 1)
    foundIndex = findItemIndex(searchInput);

    // Strategy 2: Space Separator (SKU QTY)
    if (foundIndex === -1) {
      // Split by last space to separate potential quantity
      // Logic: "ITEM NAME 123 50" -> SKU="ITEM NAME 123", QTY=50
      const lastSpaceIndex = searchInput.lastIndexOf(' ');
      if (lastSpaceIndex !== -1) {
        const potentialSku = searchInput.substring(0, lastSpaceIndex);
        const potentialQtyStr = searchInput.substring(lastSpaceIndex + 1);
        
        if (/^\d+$/.test(potentialQtyStr)) {
          const idx = findItemIndex(potentialSku);
          if (idx !== -1) {
            foundIndex = idx;
            quantityToAdd = parseInt(potentialQtyStr, 10);
          }
        }
      }
    }

    // Strategy 3: Asterisk Separator (QTY*SKU or SKU*QTY)
    if (foundIndex === -1 && searchInput.includes('*')) {
      const parts = searchInput.split('*');
      if (parts.length === 2) {
        // QTY*SKU
        if (/^\d+$/.test(parts[0])) {
           const idx = findItemIndex(parts[1]);
           if (idx !== -1) {
             foundIndex = idx;
             quantityToAdd = parseInt(parts[0], 10);
           }
        }
        // SKU*QTY
        if (foundIndex === -1 && /^\d+$/.test(parts[1])) {
           const idx = findItemIndex(parts[0]);
           if (idx !== -1) {
             foundIndex = idx;
             quantityToAdd = parseInt(parts[1], 10);
           }
        }
      }
    }

    if (foundIndex >= 0) {
      const newItems = [...items];
      newItems[foundIndex] = {
        ...newItems[foundIndex],
        physicalQty: newItems[foundIndex].physicalQty + quantityToAdd,
        scannedAt: new Date().toISOString()
      };
      setItems(newItems);
      setLastScanned(newItems[foundIndex]);
      setLastQtyAdded(quantityToAdd);
      setScanError(null);
    } else {
      setScanError(`Código no encontrado: ${searchInput}`);
      setLastScanned(null);
      setLastQtyAdded(0);
    }
    setBarcodeInput('');
    inputRef.current?.focus();
  };

  const finishAudit = () => {
    setStatus(AuditStatus.COMPLETED);
  };

  const saveAndDownload = () => {
    const fullSession: AuditSession = {
      ...(sessionData as AuditSession),
      items: items,
      status: AuditStatus.COMPLETED
    };
    
    AuditService.saveToHistory(fullSession);
    AuditService.generatePDF(fullSession);
    setHistory(AuditService.getHistory());
    
    // Optional: Reset to IDLE after save
    // setStatus(AuditStatus.IDLE);
  };

  const resetApp = () => {
    // If logging out or resetting from dashboard, no confirmation needed if idle
    if (status === AuditStatus.IDLE && !currentUser) {
        setStatus(AuditStatus.IDLE);
        setItems([]);
        setSessionData({});
        return;
    }

    if (status === AuditStatus.IDLE) {
        // Just clearing setup data if any
        setItems([]);
        setSessionData({});
        return;
    }

    if (confirm("¿Estás seguro de salir? Se perderán los datos no guardados.")) {
      setStatus(AuditStatus.IDLE);
      setItems([]);
      setSessionData({});
      setLastScanned(null);
      setSearchQuery('');
    }
  };

  // --- Views ---

  const renderLogin = () => (
    <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <img src="https://i.ibb.co/hFq3BtD9/Movilnet-logo-0.png" alt="Logo" className="h-12 mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold text-gray-900">Bienvenido a AuditPro</h1>
          <p className="text-gray-500 mt-2">Inicia sesión para acceder al sistema de inventario</p>
        </div>
        
        <Card className="p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                  type="text" 
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="Ej. admin"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                  type="password" 
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                />
              </div>
            </div>

            {loginError && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {loginError}
              </div>
            )}

            <button 
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 group"
            >
              Iniciar Sesión
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">Credenciales Demo: admin / 1234</p>
          </div>
        </Card>
        
        <p className="text-center text-xs text-gray-400 mt-8">© 2024 AuditPro Inventory System</p>
      </div>
    </div>
  );

  const renderHeader = () => (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="https://i.ibb.co/hFq3BtD9/Movilnet-logo-0.png" alt="Logo" className="h-8 object-contain" />
          <span className="text-xl font-bold text-gray-800 tracking-tight border-l pl-3 ml-1 border-gray-300 hidden sm:block">AuditPro</span>
        </div>
        
        {currentUser && (
          <div className="flex items-center gap-6">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-semibold text-gray-800">{currentUser.name}</span>
              <span className="text-xs text-gray-500">{currentUser.role}</span>
            </div>

            <div className="h-8 w-px bg-gray-200 hidden md:block"></div>

            <div className="flex items-center gap-3">
              {status !== AuditStatus.IDLE && (
                <button 
                  onClick={resetApp}
                  className="text-sm font-medium text-gray-500 hover:text-red-600 px-3 py-1.5 rounded-md hover:bg-red-50 transition-colors flex items-center gap-2"
                >
                  <X className="w-4 h-4" /> 
                  <span className="hidden sm:inline">Cancelar</span>
                </button>
              )}
              
              <button 
                onClick={handleLogout}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 p-2 rounded-full hover:bg-gray-100 transition-colors"
                title="Cerrar Sesión"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );

  const renderDashboard = () => (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Panel de Control</h1>
        <p className="text-gray-500">Bienvenido de nuevo, {currentUser?.name}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* New Audit Action */}
        <Card className="p-8 flex flex-col items-center justify-center text-center hover:shadow-md transition-shadow cursor-pointer border-dashed border-2 border-blue-200 bg-blue-50" >
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Barcode className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Nuevo Inventario</h2>
          <p className="text-gray-500 mb-6">Carga tu Excel y comienza a escanear.</p>
          <button 
            onClick={() => setStatus(AuditStatus.SETUP)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow-lg shadow-blue-600/20"
          >
            Comenzar Auditoría
          </button>
        </Card>

        {/* Recent History */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <History className="w-5 h-5 text-gray-500" /> Historial Reciente
            </h3>
          </div>
          {history.length === 0 ? (
            <div className="text-center py-8 text-gray-400">No hay auditorías registradas.</div>
          ) : (
            <div className="space-y-4">
              {history.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div>
                    <p className="font-semibold text-gray-800">{entry.storeName}</p>
                    <p className="text-xs text-gray-500">{new Date(entry.date).toLocaleDateString()} • {entry.auditorName}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">{entry.totalItems} Items</div>
                    <div className={`text-xs ${entry.totalDiscrepancies > 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {entry.totalDiscrepancies === 0 ? 'Sin incidencias' : `${entry.totalDiscrepancies} incidencias`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );

  const renderSetup = () => (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Card className="p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Configuración de Auditoría</h2>
        
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tienda / Sucursal</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="text" 
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Ej. Tienda Central"
                  value={sessionData.storeName || ''}
                  onChange={e => setSessionData({...sessionData, storeName: e.target.value})}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Responsable</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="text" 
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-gray-50 text-gray-500"
                  placeholder="Tu Nombre"
                  value={sessionData.auditorName || ''}
                  readOnly
                  // onChange={e => setSessionData({...sessionData, auditorName: e.target.value})} // Disabled editing
                />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Cargar Inventario Teórico (.xlsx)</label>
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-8 h-8 mb-2 text-gray-500" />
                  <p className="text-sm text-gray-500"><span className="font-semibold">Click para subir</span> o arrastra el archivo</p>
                  <p className="text-xs text-gray-500 mt-1">Requiere columnas: SKU, Descripcion, Cantidad</p>
                </div>
                <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} />
              </label>
            </div>
            {items.length > 0 && (
              <div className="mt-4 flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">{items.length} productos cargados correctamente.</span>
              </div>
            )}
          </div>

          <button 
            onClick={startAudit}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold text-lg shadow-lg shadow-blue-600/20 transition-all mt-4"
          >
            Iniciar Toma de Inventario
          </button>
        </div>
      </Card>
    </div>
  );

  const renderActiveAudit = () => {
    const totalPhysical = items.reduce((acc, i) => acc + i.physicalQty, 0);
    const progress = Math.round((items.filter(i => i.physicalQty > 0).length / items.length) * 100) || 0;

    const filteredItems = items.filter(item => 
      item.sku.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <div className="max-w-7xl mx-auto px-4 py-6 h-[calc(100vh-64px)] flex flex-col">
        {/* Top Info Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 bg-gray-800 text-white border-none">
            <p className="text-gray-400 text-xs uppercase font-bold">Total Scaneado</p>
            <p className="text-3xl font-mono">{totalPhysical}</p>
          </Card>
          <Card className="p-4">
            <p className="text-gray-500 text-xs uppercase font-bold">Progreso (Items)</p>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-bold text-blue-600">{progress}%</p>
              <p className="text-sm text-gray-400 mb-1">{items.filter(i => i.physicalQty > 0).length} / {items.length}</p>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
              <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
            </div>
          </Card>
          <Card className="p-4 col-span-2 flex items-center justify-between">
             <div>
                <p className="text-xs text-gray-500 font-bold uppercase">Tienda</p>
                <p className="font-semibold text-gray-800">{sessionData.storeName}</p>
             </div>
             <button 
                onClick={finishAudit}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
             >
               Finalizar Inventario
             </button>
          </Card>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
          
          {/* Left Column: Scanner & Feedback */}
          <div className="flex flex-col gap-6">
            <Card className="p-6 border-blue-500 border-2 shadow-lg shadow-blue-500/10">
              <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">
                Escanear Código de Barras
              </label>
              <form onSubmit={handleScan} className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  className="w-full pl-4 pr-12 py-4 text-xl font-mono border-2 border-gray-300 rounded-xl focus:border-blue-600 focus:ring-0 outline-none transition-colors"
                  placeholder="Scan..."
                  autoFocus
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <Barcode className="w-6 h-6 text-gray-400" />
                </div>
              </form>
              <p className="text-xs text-gray-400 mt-2 text-center">Scan simple o formato "SKU cantidad" (ej. "A123 5")</p>
              
              {scanError && (
                <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 animate-pulse">
                  <AlertTriangle className="w-5 h-5" />
                  <span className="font-medium">{scanError}</span>
                </div>
              )}
            </Card>

            {/* Last Scanned Item Card */}
            {lastScanned ? (
              <Card className="flex-1 p-6 bg-gradient-to-br from-white to-gray-50 flex flex-col justify-center items-center text-center animate-in fade-in slide-in-from-bottom-4 duration-300 relative overflow-hidden">
                {lastQtyAdded > 1 && (
                    <div className="absolute top-4 right-4 bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full border border-blue-200 shadow-sm animate-bounce">
                        +{lastQtyAdded} unidades
                    </div>
                )}
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-1">{lastScanned.sku}</h3>
                <p className="text-lg text-gray-600 mb-6">{lastScanned.description}</p>
                
                <div className="grid grid-cols-2 gap-4 w-full">
                  <div className="bg-white p-3 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-500 uppercase">Teórico</p>
                    <p className="text-xl font-bold text-gray-700">{lastScanned.theoreticalQty}</p>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <p className="text-xs text-blue-600 uppercase font-bold">Físico</p>
                    <p className="text-xl font-bold text-blue-700">{lastScanned.physicalQty}</p>
                  </div>
                </div>
              </Card>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-300 border-2 border-dashed border-gray-200 rounded-xl">
                Esperando primer scan...
              </div>
            )}
          </div>

          {/* Right Column: List */}
          <Card className="lg:col-span-2 flex flex-col overflow-hidden h-full">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row justify-between items-center gap-4">
               <div className="flex items-center gap-2">
                 <h3 className="font-bold text-gray-700">Inventario en Tiempo Real</h3>
                 <span className="hidden sm:inline-block text-xs px-2 py-1 bg-white border rounded-full text-gray-500 border-gray-200">
                   {items.length} total
                 </span>
               </div>
               <div className="relative w-full sm:w-64">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                 <input 
                   type="text" 
                   placeholder="Buscar SKU o descripción..." 
                   className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                 />
               </div>
            </div>
            <div className="flex-1 overflow-auto custom-scrollbar p-0">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-6 py-3 font-semibold text-gray-600">SKU</th>
                    <th className="px-6 py-3 font-semibold text-gray-600">Descripción</th>
                    <th className="px-6 py-3 font-semibold text-gray-600 text-center">Teórico</th>
                    <th className="px-6 py-3 font-semibold text-gray-600 text-center">Físico</th>
                    <th className="px-6 py-3 font-semibold text-gray-600 text-center">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-400">
                        {items.length === 0 ? "No hay items cargados" : `No se encontraron resultados para "${searchQuery}"`}
                      </td>
                    </tr>
                  ) : (
                    // Sort by scannedAt (descending) then by SKU
                    [...filteredItems].sort((a, b) => {
                      if (a.scannedAt && !b.scannedAt) return -1;
                      if (!a.scannedAt && b.scannedAt) return 1;
                      if (a.scannedAt && b.scannedAt) return new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime();
                      return 0;
                    }).map((item) => {
                       const diff = item.physicalQty - item.theoreticalQty;
                       const isDiff = diff !== 0;
                       return (
                        <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${item.physicalQty > 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                          <td className="px-6 py-3 font-mono text-gray-600 font-medium">{item.sku}</td>
                          <td className="px-6 py-3 text-gray-800">{item.description}</td>
                          <td className="px-6 py-3 text-center text-gray-600">{item.theoreticalQty}</td>
                          <td className={`px-6 py-3 text-center font-bold ${item.physicalQty > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                            {item.physicalQty}
                          </td>
                          <td className="px-6 py-3 text-center">
                            {isDiff ? (
                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${diff < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                  {diff > 0 ? '+' : ''}{diff}
                                </span>
                            ) : (
                                <span className="text-gray-300">-</span>
                            )}
                          </td>
                        </tr>
                       );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>

        </div>
      </div>
    );
  };

  const renderCompleted = () => {
    const totalDiscrepancies = items.filter(i => i.physicalQty !== i.theoreticalQty).length;
    const accuracy = ((1 - (totalDiscrepancies / items.length)) * 100).toFixed(1);

    // Filter items with discrepancies
    const discrepancyItems = items.filter(i => i.physicalQty !== i.theoreticalQty);

    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Card className="p-8">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900">Auditoría Finalizada</h2>
            <p className="text-gray-500 mt-2">Revisa los resultados antes de guardar.</p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-gray-50 p-4 rounded-xl text-center">
              <p className="text-sm text-gray-500 uppercase font-bold">Total Items</p>
              <p className="text-2xl font-bold text-gray-800">{items.length}</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-xl text-center">
              <p className="text-sm text-gray-500 uppercase font-bold">Incidencias</p>
              <p className={`text-2xl font-bold ${totalDiscrepancies > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {totalDiscrepancies}
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-xl text-center">
              <p className="text-sm text-gray-500 uppercase font-bold">Precisión</p>
              <p className="text-2xl font-bold text-blue-600">{accuracy}%</p>
            </div>
          </div>

          {/* New Section: Discrepancies Summary */}
          {discrepancyItems.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" /> Resumen de Incidencias
              </h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="max-h-64 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 font-semibold text-gray-600">SKU</th>
                        <th className="px-4 py-2 font-semibold text-gray-600">Descripción</th>
                        <th className="px-4 py-2 font-semibold text-gray-600 text-center">Teórico</th>
                        <th className="px-4 py-2 font-semibold text-gray-600 text-center">Físico</th>
                        <th className="px-4 py-2 font-semibold text-gray-600 text-center">Dif.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {discrepancyItems.map((item) => {
                         const diff = item.physicalQty - item.theoreticalQty;
                         return (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-mono text-gray-600">{item.sku}</td>
                            <td className="px-4 py-2 text-gray-800 truncate max-w-[200px]" title={item.description}>{item.description}</td>
                            <td className="px-4 py-2 text-center text-gray-600">{item.theoreticalQty}</td>
                            <td className="px-4 py-2 text-center text-gray-800 font-medium">{item.physicalQty}</td>
                            <td className="px-4 py-2 text-center">
                              <span className={`px-2 py-0.5 rounded text-xs font-bold ${diff < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {diff > 0 ? '+' : ''}{diff}
                              </span>
                            </td>
                          </tr>
                         );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Observaciones Generales</label>
            <textarea
              className="w-full p-3 border border-gray-300 rounded-lg h-32 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Escribe aquí notas importantes sobre el inventario..."
              value={sessionData.observations || ''}
              onChange={e => setSessionData({...sessionData, observations: e.target.value})}
            ></textarea>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={() => setStatus(AuditStatus.ACTIVE)}
              className="flex-1 bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-50 flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Volver a Escanear
            </button>
            <button 
              onClick={saveAndDownload}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" /> Guardar y Descargar PDF
            </button>
          </div>
        </Card>
      </div>
    );
  };

  if (!currentUser) {
    return renderLogin();
  }

  return (
    <div className="min-h-screen bg-[#f3f4f6]">
      {renderHeader()}
      <main>
        {status === AuditStatus.IDLE && renderDashboard()}
        {status === AuditStatus.SETUP && renderSetup()}
        {status === AuditStatus.ACTIVE && renderActiveAudit()}
        {status === AuditStatus.COMPLETED && renderCompleted()}
      </main>
    </div>
  );
}