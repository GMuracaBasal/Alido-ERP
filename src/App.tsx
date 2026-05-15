/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { loadAllData, saveToSupabase, checkForUpdates } from './supabaseClient';
import { 
  LayoutDashboard, 
  Package, 
  Save,
  MapPin,
  Phone,
  Mail,
  Info,
  TrendingUp,
  Copy,
  Factory, 
  Users, 
  LogOut, 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  Edit2, 
  Edit3,
  Lock,
  Trash2, 
  ArrowRightLeft, 
  AlertTriangle, 
  FileText, 
  Printer, 
  Search,
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  History,
  BarChart3,
  Tag,
  Receipt,
  Barcode,
  Eye,
  ArrowUpRight,
  ArrowDownLeft,
  Settings,
  ShieldAlert,
  Thermometer,
  ArrowLeft,
  Filter,
  ChevronUp,
  Layers,
  Play,
  Calendar,
  X,
  MonitorSmartphone,
  Monitor,
  Trash,
  WifiOff,
  Scale,
  Minus,
  AlertCircle,
  ArrowRight,
  CreditCard,
  Building,
  FolderTree,
  TrendingDown,
  ShoppingBag,
  Home,
  Flame
} from 'lucide-react';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend, 
  ArcElement,
  PointElement,
  LineElement
} from 'chart.js';
import { Bar, Line, Pie } from 'react-chartjs-2';
import JsBarcode from 'jsbarcode';
import { format, addDays, isBefore, isAfter, parseISO, differenceInDays, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

let globalConfirmAction: (msg: string, onConfirm: () => void) => void = () => {};
let globalShowNotification: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void = () => {};

export const confirmDialog = (msg: string, onConfirm: () => void) => {
  globalConfirmAction(msg, onConfirm);
};

export const globalAlert = (msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'error') => {
  globalShowNotification(msg, type);
};

const safeFormat = (date: any, formatStr: string, fallback: string = '-') => {
  if (!date) return fallback;
  try {
    const d = (typeof date === 'string' && date.includes('-')) ? parseISO(date) : new Date(date);
    if (!isValid(d)) return fallback;
    return format(d, formatStr);
  } catch (e) {
    return fallback;
  }
};

const safeIsBefore = (date: any, compare: any) => {
  try {
    const d1 = typeof date === 'string' ? parseISO(date) : date;
    const d2 = typeof compare === 'string' ? parseISO(compare) : compare;
    if (!isValid(d1) || !isValid(d2)) return false;
    return isBefore(d1, d2);
  } catch (e) {
    return false;
  }
};

const safeIsAfter = (date: any, compare: any) => {
  try {
    const d1 = typeof date === 'string' ? parseISO(date) : date;
    const d2 = typeof compare === 'string' ? parseISO(compare) : compare;
    if (!isValid(d1) || !isValid(d2)) return false;
    return isAfter(d1, d2);
  } catch (e) {
    return false;
  }
};

const safeDiffDays = (date: any, compare: any) => {
  try {
    const d1 = typeof date === 'string' ? parseISO(date) : date;
    const d2 = typeof compare === 'string' ? parseISO(compare) : compare;
    if (!isValid(d1) || !isValid(d2)) return 0;
    return differenceInDays(d1, d2);
  } catch (e) {
    return 0;
  }
};

// --- Types & Interfaces ---

interface PermisosModulo {
  [seccion: string]: boolean;
}

interface Permisos {
  inventario: PermisosModulo;
  produccion: PermisosModulo;
  ventas: PermisosModulo;
  egresos: PermisosModulo;
  usuarios: PermisosModulo;
}

type UserRole = 'Administrador' | 'Operario';

interface InicioConfig {
  misLotes: boolean;
  stockCritico: boolean;
  proximosVencer: boolean;
  actividadReciente: boolean;
}

interface User {
  id: string;
  username: string;
  password?: string;
  role: UserRole;
  name: string;
  estado?: 'activo' | 'inactivo';
  permisos?: Permisos;
  inicioConfig?: InicioConfig;
}

const DEFAULT_INICIO_CONFIG: InicioConfig = {
  misLotes: true,
  stockCritico: true,
  proximosVencer: true,
  actividadReciente: true,
};

const getInicioConfig = (user: User | null): InicioConfig => ({
  ...DEFAULT_INICIO_CONFIG,
  ...user?.inicioConfig,
});

const DEFAULT_PERMISSIONS: Permisos = {
  inventario: { dashboard: true, almacenes: true, productos: true, movimientos: true, alertas: true, reportes: true },
  produccion: { lotes_produccion: true, lotes_despiece: true, recetas_estandar: true, plantillas_despiece: true, etiquetas: true, dashboard: true, trazabilidad: true },
  ventas: { ventas_pedidos: true, dashboard_ventas: true, clientes: true, listas_precios: true, puntos_venta: true },
  egresos: { egresos_compras: true, proveedores: true, tipos_egreso: true, plan_cuentas: true },
  usuarios: { gestion_usuarios: true }
};

const normalizeSection = (section: string) => section.toLowerCase().replace(/ de /g, ' ').replace(/ y /g, '_').replace(/ /g, '_').replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u');

const hasPermission = (user: User | null, moduleName: string, sectionName: string): boolean => {
  if (!user) return false;
  if (normalizeSection(moduleName) === 'inicio') return true;
  if (user.username === 'GuidoM') return true; // Superadmin
  if (!user.permisos) return true; // Backwards compatibility for old users
  
  // Normalize names
  const modKey = normalizeSection(moduleName) as keyof Permisos;
  if (!user.permisos[modKey]) return false;
  
  const secKey = normalizeSection(sectionName);
  return !!user.permisos[modKey][secKey];
};

const hasAnyPermissionInModule = (user: User | null, moduleName: string): boolean => {
  if (!user) return false;
  if (user.username === 'GuidoM') return true;
  if (!user.permisos) return true;
  
  const modKey = normalizeSection(moduleName) as keyof Permisos;
  if (!user.permisos[modKey]) return false;
  
  return Object.values(user.permisos[modKey]).some(val => val === true);
};

interface Almacen {
  id: string;
  nombre: string;
  descripcion: string;
  capacidadMax: number;
  capacidadUnidadId: string;
  tempMin: number;
  tempMax: number;
  tipoAlmacenamiento: string;
}

type TipoProducto = 'Materia Prima' | 'Producto Terminado';
type OrigenProducto = 'Producción propia' | 'Reventa' | 'Despiece';

interface Familia {
  id: string;
  nombre: string;
}

interface Subfamilia {
  id: string;
  nombre: string;
  familiaId: string;
}

interface UnidadMedida {
  id: string;
  abreviatura: string;
  nombre: string;
}

interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  tipo: TipoProducto;
  origen?: OrigenProducto;
  unidadMedidaId: string;
  alergenos: string[];
  condicionAlmacenamiento: string;
  vidaUtil: {
    valor: number;
    unidad: 'días' | 'meses';
  };
  precioReferencia?: number;
  usoCruzado?: boolean;
  pesoEquivalenteKg?: number;
  // Solo Materia Prima
  proveedor?: string;
  // Solo Producto Terminado
  familiaId?: string;
  subfamiliaId?: string;
  pesoNetoUnidad?: number;
  pesoBrutoUnidad?: number;
  ean13?: string;
  // Legacy fields for compatibility
  unidadMedida?: string;
  alerggenos?: string[];
  vidaUtilDias?: number;
  precioCosto?: number;
  precioVenta?: number;
  familia?: string;
  subfamilia?: string;
}

interface LoteStock {
  id: string;
  productoId: string;
  almacenId: string;
  numeroLote: string;
  cantidad: number;
  fechaIngreso: string;
  fechaVencimiento: string;
  pesoEquivalenteReal?: number;
}

interface Movimiento {
  id: string;
  tipo: 'entrada' | 'salida' | 'transferencia';
  productoId: string;
  almacenId: string; // destino para entrada, origen para salida
  almacenDestinoId?: string | null; // solo para transferencias
  cantidad: number;
  unidad: string;
  cantidadKg: number; // equivalencia en kg
  motivo: string;
  loteNumero: string;
  fechaIngreso: string;
  fechaVencimiento: string;
  proveedor?: string;
  numeroFactura?: string;
  costoUnitario?: number;
  referencia?: string | null; // referencia a lote de producción si es automático
  origen: 'manual' | 'produccion' | 'despiece' | 'transferencia';
  usuario: string;
  fechaHora: string;
  anulado: boolean;
  anuladoPor?: string | null;
  anuladoFecha?: string | null;
  observaciones: string;
}

interface Receta {
  id: string;
  productoTerminadoId: string;
  cantidadBase: number;
  rendimientoEsperado?: number;
  insumos: {
    materiaPrimaId: string;
    cantidad: number;
  }[];
  observaciones?: string;
  creadoPor: string;
  fechaCreacion: string;
  ultimaModificacion?: {
    usuarioId: string;
    fecha: string;
  };
}

interface RecetaHistorial {
  id: string;
  recetaId: string;
  fecha: string;
  usuarioId: string;
  accion: 'Creación' | 'Modificación';
  detalle: string;
}

type LoteEstado = 'Planificado' | 'En Proceso' | 'Finalizado' | 'Cerrado';

interface LoteProduccion {
  id: string;
  numeroLote: string;
  productoTerminadoId: string;
  cantidadEstimada: number;
  fechaElaboracion: string;
  fechaVencimiento: string;
  estado: LoteEstado;
  responsableId: string;
  observaciones: string;
  insumos: {
    materiaPrimaId: string;
    cantidadTeorica: number;
    cantidadReal: number;
    almacenId?: string;
  }[];
  pesoBruto?: number;
  pesoNeto?: number;
  unidadesReales?: number;
  almacenDestinoId?: string;
  rendimientoReal?: number;
  mermaKg?: number;
  mermaPorcentaje?: number;
  desvioRendimiento?: number;
  fechaFinalizacion?: string;
}

interface LoteProduccionHistorial {
  id: string;
  loteId: string;
  fecha: string;
  usuarioId: string;
  accion: 'Creación' | 'Modificación' | 'Finalización' | 'Cierre';
  detalle: string;
}

interface PlantillaDespiece {
  id: string;
  materiaPrimaId: string;
  cortes: {
    productoId: string;
    rendimientoEsperado: number;
  }[];
  observaciones?: string;
  creadoPor: string;
  fechaCreacion: string;
  ultimaModificacion?: {
    usuarioId: string;
    fecha: string;
  };
}

interface PlantillaDespieceHistorial {
  id: string;
  plantillaId: string;
  fecha: string;
  usuarioId: string;
  accion: 'Creación' | 'Modificación';
  detalle: string;
}

type LoteDespieceEstado = 'Planificado' | 'En Proceso' | 'Finalizado' | 'Cerrado';

interface LoteDespiece {
  id: string;
  numeroLote: string;
  materiaPrimaId: string;
  cantidadIngresada: number;
  fechaElaboracion: string;
  fechaVencimiento: string;
  estado: LoteDespieceEstado;
  responsableId: string;
  observaciones: string;
  cortes: {
    productoId: string;
    cantidadEsperada?: number;
    cantidadReal: number;
    unidadesReales?: number;
    almacenDestinoId?: string;
    numeroLoteGenerado?: string;
  }[];
  rendimientoReal?: number;
  mermaKg?: number;
  mermaPorcentaje?: number;
  desvioRendimiento?: number;
  fechaFinalizacion?: string;
}

interface LoteDespieceHistorial {
  id: string;
  loteId: string;
  fecha: string;
  usuarioId: string;
  accion: 'Creación' | 'Modificación' | 'Finalización' | 'Cierre';
  detalle: string;
}

interface StockSeguridad {
  productoId: string;
  almacenId: string;
  cantidad: number;
}

// --- Sales Types ---

interface Sucursal {
  id: string;
  nombre: string;
  direccion: string;
  telefono?: string;
  responsable?: string;
  horarioEntrega?: string;
}

interface DescuentoProducto {
  productoId: string;
  porcentaje: number;
}

type CanalVenta = 'Distribuidor' | 'Comercio' | 'Particular' | 'Otro';
type CondicionPago = 'Cuenta Corriente' | 'Contado';

interface Cliente {
  id: string;
  razonSocial: string;
  cuit?: string;
  canal: CanalVenta;
  listaPrecioId: string;
  condicionPago: CondicionPago;
  topeCredito?: number;
  telefono?: string;
  email?: string;
  observaciones?: string;
  estado: 'Activo' | 'Inactivo';
  sucursales: Sucursal[];
  descuentosEspeciales: DescuentoProducto[];
}

interface ProductoPrecio {
  productoId: string;
  precio: number;
  escalas?: { desde: number; hasta: number; precio: number }[];
}

interface ListaPrecio {
  id: string;
  nombre: string;
  descripcion?: string;
  estado: 'Activa' | 'Inactiva';
  productos: ProductoPrecio[];
  ultimaActualizacion: {
    fecha: string;
    usuarioId: string;
  };
}

interface PuntoVenta {
  id: string;
  nombre: string;
  direccion?: string;
  responsableId: string;
  estado: 'Activo' | 'Inactiva';
}

interface VentaProducto {
  productoId: string;
  codigoBarras: string | null; // null si fue manual
  cantidad: number;
  unidad: string;
  precioUnitario: number;
  descuento: number; // porcentaje Individual
  subtotal: number;
  manualPrice?: boolean;
  pesoKg?: number; // peso real en kg (para productos vendidos por unidad)
}

interface Cobro {
  monto: number;
  metodo: 'Efectivo' | 'Transferencia' | 'Cheque' | 'Otro';
  fecha: string;
  observaciones?: string;
}

interface Venta {
  id: string;
  puntoVentaId: string;
  clienteId: string;
  sucursalId: string;
  fecha: string;
  estado: 'En Proceso' | 'Finalizado' | 'Anulado';
  productos: VentaProducto[];
  subtotal: number;
  descuentoGeneral: number; // monto
  tipoDescuentoGeneral: '%' | '$';
  total: number;
  cobros: Cobro[];
  totalCobrado: number;
  saldoPendiente: number;
  estadoCobro: 'Pendiente' | 'Parcial' | 'Cobrado';
  observaciones?: string;
  usuario: string;
  fechaCreacion: string;
  comprobante: string; // autogenerado
}

// --- Egresos Types ---

interface PlanCuenta {
  id: string;
  codigo: string;
  nombre: string;
  nivel: 1 | 2 | 3;
  parentId: string | null;
  tipo?: 'Costo' | 'Gasto' | 'Inversión' | 'Financiero';
  estado: 'Activa' | 'Inactiva';
}

interface TipoEgreso {
  id: string;
  nombre: string;
  descripcion?: string;
  color: string;
  cuentaContableDefectoId?: string; // ID of Detalle (Level 3)
  impactaInventario: boolean;
  estado: 'Activo' | 'Inactivo';
}

interface Proveedor {
  id: string;
  razonSocial: string;
  cuit?: string;
  rubro: string;
  condicionPago: 'Cuenta Corriente' | 'Contado';
  plazoPagoHabitual?: number;
  telefono?: string;
  email?: string;
  direccion?: string;
  contacto?: string;
  observaciones?: string;
  tipoEgresoDefectoId?: string;
  cuentaContableDefectoId?: string;
  estado: 'Active' | 'Inactive' | 'Activo' | 'Inactivo';
}

interface PagoProveedor {
  id: string;
  proveedorId: string;
  egresoId?: string; 
  fecha: string;
  monto: number;
  metodo: 'Efectivo' | 'Transferencia' | 'Cheque' | 'Otro';
  referencia?: string;
  comprobante: string; // OP-YYYYMMDD-NNN
  observaciones?: string;
}

interface EgresoItem {
  id: string;
  productoId?: string; // if impactaInventario
  cantidad?: number;
  precioUnitario?: number;
  loteProveedor?: string;
  fechaVencimiento?: string;
  concepto?: string; // if not impactaInventario
  monto?: number;
  subtotal: number;
}

interface Egreso {
  id: string;
  comprobante: string;
  fecha: string;
  tipoEgresoId: string;
  cuentaContableId: string;
  proveedorId?: string;
  nroFacturaProveedor?: string;
  fechaVencimientoPago?: string;
  observaciones?: string;
  items: EgresoItem[];
  neto: number;
  tipoIva: 'Exento / No aplica' | 'IVA 10,5%' | 'IVA 21%' | 'IVA incluido 21%' | 'IVA incluido 10,5%' | 'Monto manual';
  iva: number;
  total: number;
  estado: 'Borrador' | 'Confirmado' | 'Anulado';
  estadoPago: 'Pendiente' | 'Parcial' | 'Pagado';
  usuario: string;
  fechaCreacion: string;
}

interface PlantillaEgreso {
  id: string;
  nombre: string;
  data: Partial<Egreso>;
}

interface MercaderiaPendiente {
  id: string;
  egresoId: string;
  egresoComprobante: string;
  productoId: string;
  cantidad: number;
  loteProveedor: string;
  fechaVencimiento: string;
  proveedorId?: string;
  fechaCompra: string;
}

// --- Constants ---

const ALERGENOS_OPTIONS = ['Gluten', 'Lácteos', 'Soja', 'Huevo', 'Frutos Secos', 'Maní', 'Pescado', 'Mariscos', 'Otro'];
const CONDICIONES_ALMACENAMIENTO = ['Refrigerado', 'Congelado', 'Ambiente', 'Temperatura controlada'];

// --- Initial Data ---

const INITIAL_USERS: User[] = [
  { id: '1', username: 'GuidoM', password: 'Alido', role: 'Administrador', name: 'Guido Muraca', estado: 'activo', inicioConfig: { ...DEFAULT_INICIO_CONFIG }, permisos: {
    inventario: { dashboard: true, almacenes: true, productos: true, movimientos: true, alertas: true, reportes: true },
    produccion: { lotes_produccion: true, lotes_despiece: true, recetas_estandar: true, plantillas_despiece: true, etiquetas: true, dashboard: true, trazabilidad: true },
    ventas: { ventas_pedidos: true, dashboard_ventas: true, clientes: true, listas_precios: true, puntos_venta: true },
    egresos: { egresos_compras: true, proveedores: true, tipos_egreso: true, plan_cuentas: true },
    usuarios: { gestion_usuarios: true }
  }},
  { id: '2', username: 'Operario1', password: '123', role: 'Operario', name: 'Juan Pérez', estado: 'activo', inicioConfig: { ...DEFAULT_INICIO_CONFIG }, permisos: {
    inventario: { dashboard: false, almacenes: true, productos: false, movimientos: true, alertas: false, reportes: false },
    produccion: { lotes_produccion: true, lotes_despiece: true, recetas_estandar: false, plantillas_despiece: false, etiquetas: true, dashboard: false, trazabilidad: false },
    ventas: { ventas_pedidos: true, dashboard_ventas: false, clientes: false, listas_precios: false, puntos_venta: false },
    egresos: { egresos_compras: false, proveedores: false, tipos_egreso: false, plan_cuentas: false },
    usuarios: { gestion_usuarios: false }
  }}
];

const INITIAL_ALMACENES: Almacen[] = [
  { 
    id: 'a1', 
    nombre: 'Cámara Frigorífica MP', 
    descripcion: 'Materia prima refrigerada', 
    capacidadMax: 5000, 
    capacidadUnidadId: 'u1',
    tempMin: -2,
    tempMax: 3,
    tipoAlmacenamiento: 'Refrigerado'
  },
  { 
    id: 'a2', 
    nombre: 'Cámara de Congelados PT', 
    descripcion: 'Productos terminados congelados', 
    capacidadMax: 8000, 
    capacidadUnidadId: 'u1',
    tempMin: -18,
    tempMax: -12,
    tipoAlmacenamiento: 'Congelado'
  },
  { 
    id: 'a3', 
    nombre: 'Depósito de Secos', 
    descripcion: 'Insumos no perecederos', 
    capacidadMax: 3000, 
    capacidadUnidadId: 'u1',
    tempMin: 15,
    tempMax: 25,
    tipoAlmacenamiento: 'Ambiente'
  }
];

const INITIAL_FAMILIAS: Familia[] = [
  { id: 'f1', nombre: 'Empanados' },
  { id: 'f2', nombre: 'Hamburguesas' },
  { id: 'f3', nombre: 'Embutidos' }
];

const INITIAL_SUBFAMILIAS: Subfamilia[] = [
  { id: 'sf1', nombre: 'Milanesas', familiaId: 'f1' },
  { id: 'sf2', nombre: 'Nuggets', familiaId: 'f1' },
  { id: 'sf3', nombre: 'Supremas', familiaId: 'f1' },
  { id: 'sf4', nombre: 'Carne Vacuna', familiaId: 'f2' },
  { id: 'sf5', nombre: 'Pollo', familiaId: 'f2' },
  { id: 'sf6', nombre: 'Chorizos', familiaId: 'f3' },
  { id: 'sf7', nombre: 'Salchichas', familiaId: 'f3' }
];

const INITIAL_UNIDADES: UnidadMedida[] = [
  { id: 'u1', abreviatura: 'kg', nombre: 'Kilogramos' },
  { id: 'u2', abreviatura: 'lt', nombre: 'Litros' },
  { id: 'u3', abreviatura: 'un', nombre: 'Unidades' },
  { id: 'u4', abreviatura: 'g', nombre: 'Gramos' }
];

const INITIAL_PRODUCTOS: Producto[] = [
  { id: 'p1', codigo: 'PROD-001', nombre: 'Carne Vacuna (Cuadril)', descripcion: 'Corte magro', tipo: 'Materia Prima', unidadMedidaId: 'u1', alergenos: [], condicionAlmacenamiento: 'Refrigerado', vidaUtil: { valor: 7, unidad: 'días' }, proveedor: 'Frigorífico Central', precioReferencia: 8500 },
  { id: 'p2', codigo: 'PROD-002', nombre: 'Pechuga de Pollo', descripcion: 'Sin piel', tipo: 'Materia Prima', unidadMedidaId: 'u1', alergenos: [], condicionAlmacenamiento: 'Refrigerado', vidaUtil: { valor: 5, unidad: 'días' }, proveedor: 'Avícola Sur', precioReferencia: 4200 },
  { id: 'p3', codigo: 'PROD-003', nombre: 'Pan Rallado', descripcion: 'Fino', tipo: 'Materia Prima', unidadMedidaId: 'u1', alergenos: ['Gluten'], condicionAlmacenamiento: 'Ambiente', vidaUtil: { valor: 6, unidad: 'meses' }, proveedor: 'Molino Norte', precioReferencia: 1200 },
  { id: 'p4', codigo: 'PROD-004', nombre: 'Huevo Líquido', descripcion: 'Pasteurizado', tipo: 'Materia Prima', unidadMedidaId: 'u2', alergenos: ['Huevo'], condicionAlmacenamiento: 'Refrigerado', vidaUtil: { valor: 10, unidad: 'días' }, proveedor: 'Ovoprod', precioReferencia: 2500 },
  { id: 'p5', codigo: 'PROD-007', nombre: 'Rebozador', descripcion: 'Especial', tipo: 'Materia Prima', unidadMedidaId: 'u1', alergenos: ['Gluten'], condicionAlmacenamiento: 'Ambiente', vidaUtil: { valor: 6, unidad: 'meses' }, proveedor: 'Molino Norte', precioReferencia: 1300 },
  { id: 'p6', codigo: 'PROD-008', nombre: 'Condimentos', descripcion: 'Mix especias', tipo: 'Materia Prima', unidadMedidaId: 'u1', alergenos: [], condicionAlmacenamiento: 'Ambiente', vidaUtil: { valor: 12, unidad: 'meses' }, proveedor: 'Especias del Sol', precioReferencia: 5000 },
  { id: 'pt1', codigo: 'PROD-005', nombre: 'Milanesa de Pollo 80g', descripcion: 'Empanada clásica', tipo: 'Producto Terminado', origen: 'Producción propia', unidadMedidaId: 'u3', alergenos: ['Gluten', 'Huevo'], condicionAlmacenamiento: 'Refrigerado', vidaUtil: { valor: 5, unidad: 'días' }, familiaId: 'f1', subfamiliaId: 'sf1', pesoNetoUnidad: 0.08, pesoBrutoUnidad: 0.085, precioReferencia: 9500, ean13: '7791234567890' },
  { id: 'pt2', codigo: 'PROD-006', nombre: 'Hamburguesa de Carne 120g', descripcion: '100% vacuna', tipo: 'Producto Terminado', origen: 'Producción propia', unidadMedidaId: 'u3', alergenos: [], condicionAlmacenamiento: 'Congelado', vidaUtil: { valor: 3, unidad: 'meses' }, familiaId: 'f2', subfamiliaId: 'sf4', pesoNetoUnidad: 0.12, pesoBrutoUnidad: 0.125, precioReferencia: 12000, ean13: '7790987654321' },
  // Reventa
  { id: 'pt3', codigo: 'REV-001', nombre: 'Papas Noisette Congeladas 2kg', descripcion: 'Papas noisette prefritas', tipo: 'Producto Terminado', origen: 'Reventa', unidadMedidaId: 'u3', alergenos: [], condicionAlmacenamiento: 'Congelado', vidaUtil: { valor: 12, unidad: 'meses' }, familiaId: 'f6', subfamiliaId: 'sf8', pesoNetoUnidad: 2, pesoBrutoUnidad: 2.1, precioReferencia: 4500, ean13: '7791112223334' },
  { id: 'pt4', codigo: 'REV-002', nombre: 'Rabas Rebozadas 500g marca X', descripcion: 'Rabas listas para freír', tipo: 'Producto Terminado', origen: 'Reventa', unidadMedidaId: 'u3', alergenos: ['Gluten', 'Mariscos'], condicionAlmacenamiento: 'Congelado', vidaUtil: { valor: 6, unidad: 'meses' }, familiaId: 'f6', subfamiliaId: 'sf9', pesoNetoUnidad: 0.5, pesoBrutoUnidad: 0.55, precioReferencia: 8900, ean13: '7794445556667' },
  // Despiece (Cortes)
  { id: 'pt5', codigo: 'DES-001', nombre: 'Pechuga de Pollo', descripcion: 'Corte de despiece', tipo: 'Producto Terminado', origen: 'Despiece', unidadMedidaId: 'u1', alergenos: [], condicionAlmacenamiento: 'Refrigerado', vidaUtil: { valor: 5, unidad: 'días' }, familiaId: 'f4', subfamiliaId: 'sf6', pesoNetoUnidad: 1, pesoBrutoUnidad: 1, precioReferencia: 5500, usoCruzado: true },
  { id: 'pt5b', codigo: 'DES-001B', nombre: 'Suprema de Pollo', descripcion: 'Corte de despiece preparado', tipo: 'Producto Terminado', origen: 'Despiece', unidadMedidaId: 'u1', alergenos: [], condicionAlmacenamiento: 'Refrigerado', vidaUtil: { valor: 5, unidad: 'días' }, familiaId: 'f4', subfamiliaId: 'sf6', pesoNetoUnidad: 1, pesoBrutoUnidad: 1, precioReferencia: 5800, usoCruzado: true },
  { id: 'pt6', codigo: 'DES-002', nombre: 'Pata Muslo de Pollo', descripcion: 'Corte de despiece', tipo: 'Producto Terminado', origen: 'Despiece', unidadMedidaId: 'u1', alergenos: [], condicionAlmacenamiento: 'Refrigerado', vidaUtil: { valor: 5, unidad: 'días' }, familiaId: 'f4', subfamiliaId: 'sf6', pesoNetoUnidad: 1, pesoBrutoUnidad: 1, precioReferencia: 4800 },
  { id: 'pt7', codigo: 'DES-003', nombre: 'Alas de Pollo', descripcion: 'Corte de despiece', tipo: 'Producto Terminado', origen: 'Despiece', unidadMedidaId: 'u1', alergenos: [], condicionAlmacenamiento: 'Refrigerado', vidaUtil: { valor: 5, unidad: 'días' }, familiaId: 'f4', subfamiliaId: 'sf6', pesoNetoUnidad: 1, pesoBrutoUnidad: 1, precioReferencia: 3200 },
  { id: 'pt8', codigo: 'DES-004', nombre: 'Menudos de Pollo', descripcion: 'Corte de despiece', tipo: 'Producto Terminado', origen: 'Despiece', unidadMedidaId: 'u1', alergenos: [], condicionAlmacenamiento: 'Refrigerado', vidaUtil: { valor: 3, unidad: 'días' }, familiaId: 'f4', subfamiliaId: 'sf6', pesoNetoUnidad: 1, pesoBrutoUnidad: 1, precioReferencia: 1500 },
  { id: 'pt9', codigo: 'DES-005', nombre: 'Bife Angosto', descripcion: 'Corte de despiece vacuno', tipo: 'Producto Terminado', origen: 'Despiece', unidadMedidaId: 'u1', alergenos: [], condicionAlmacenamiento: 'Refrigerado', vidaUtil: { valor: 7, unidad: 'días' }, familiaId: 'f5', subfamiliaId: 'sf7', pesoNetoUnidad: 1, pesoBrutoUnidad: 1, precioReferencia: 12000, usoCruzado: true },
  { id: 'pt10', codigo: 'DES-006', nombre: 'Asado', descripcion: 'Corte de despiece vacuno', tipo: 'Producto Terminado', origen: 'Despiece', unidadMedidaId: 'u1', alergenos: [], condicionAlmacenamiento: 'Refrigerado', vidaUtil: { valor: 7, unidad: 'días' }, familiaId: 'f5', subfamiliaId: 'sf7', pesoNetoUnidad: 1, pesoBrutoUnidad: 1, precioReferencia: 9500, usoCruzado: true },
  { id: 'pt11', codigo: 'DES-007', nombre: 'Matambre', descripcion: 'Corte de despiece vacuno', tipo: 'Producto Terminado', origen: 'Despiece', unidadMedidaId: 'u1', alergenos: [], condicionAlmacenamiento: 'Refrigerado', vidaUtil: { valor: 7, unidad: 'días' }, familiaId: 'f5', subfamiliaId: 'sf7', pesoNetoUnidad: 1, pesoBrutoUnidad: 1, precioReferencia: 11000 },
  // Materias primas para despiece
  { id: 'mp1', codigo: 'MP-001', nombre: 'Pollo Entero', descripcion: 'Pieza entera para desposte', tipo: 'Materia Prima', unidadMedidaId: 'u1', alergenos: [], condicionAlmacenamiento: 'Refrigerado', vidaUtil: { valor: 5, unidad: 'días' }, proveedor: 'Avícola Sur', precioReferencia: 3500 },
  { id: 'mp2', codigo: 'MP-002', nombre: 'Media Res Vacuna', descripcion: 'Pieza entera para desposte', tipo: 'Materia Prima', unidadMedidaId: 'u1', alergenos: [], condicionAlmacenamiento: 'Refrigerado', vidaUtil: { valor: 7, unidad: 'días' }, proveedor: 'Frigorífico Central', precioReferencia: 7200, pesoEquivalenteKg: 120 },
  { id: 'mp3', codigo: 'MP-003', nombre: 'Pieza de Cerdo', descripcion: 'Pieza entera para desposte', tipo: 'Materia Prima', unidadMedidaId: 'u1', alergenos: [], condicionAlmacenamiento: 'Refrigerado', vidaUtil: { valor: 5, unidad: 'días' }, proveedor: 'Cerdos del Monte', precioReferencia: 5800 }
];

const INITIAL_STOCK_SEGURIDAD: StockSeguridad[] = [
  { productoId: 'p2', almacenId: 'a1', cantidad: 200 },
  { productoId: 'p1', almacenId: 'a1', cantidad: 300 },
  { productoId: 'pt1', almacenId: 'a2', cantidad: 500 },
  { productoId: 'pt2', almacenId: 'a2', cantidad: 400 },
  { productoId: 'p3', almacenId: 'a3', cantidad: 100 },
  { productoId: 'p5', almacenId: 'a3', cantidad: 80 },
  { productoId: 'p6', almacenId: 'a3', cantidad: 30 }
];

const INITIAL_RECETAS: Receta[] = [
  { 
    id: 'r1', 
    productoTerminadoId: 'pt1', 
    cantidadBase: 100, 
    rendimientoEsperado: 90,
    insumos: [
      { materiaPrimaId: 'p2', cantidad: 55 },
      { materiaPrimaId: 'p3', cantidad: 30 },
      { materiaPrimaId: 'p5', cantidad: 10 },
      { materiaPrimaId: 'p6', cantidad: 5 }
    ],
    observaciones: 'Empanado tradicional. Proceso de fritura a 170°C por 3 minutos.',
    creadoPor: '1',
    fechaCreacion: '2024-04-15T10:00:00Z'
  },
  { 
    id: 'r2', 
    productoTerminadoId: 'pt2', 
    cantidadBase: 100, 
    rendimientoEsperado: 95,
    insumos: [
      { materiaPrimaId: 'p1', cantidad: 70 },
      { materiaPrimaId: 'p3', cantidad: 15 },
      { materiaPrimaId: 'p5', cantidad: 10 },
      { materiaPrimaId: 'p6', cantidad: 5 }
    ],
    observaciones: 'Mezclar ingredientes en amasadora por 8 minutos.',
    creadoPor: '1',
    fechaCreacion: '2024-04-15T11:00:00Z'
  }
];

const INITIAL_RECETAS_HISTORIAL: RecetaHistorial[] = [];

const INITIAL_PUNTOS_VENTA: PuntoVenta[] = [
  { id: 'pv1', nombre: 'Planta Alido', direccion: 'Calle Falsa 123', responsableId: '1', estado: 'Activo' }
];

const INITIAL_LISTAS_PRECIOS: ListaPrecio[] = [
  { 
    id: 'lp-dist', 
    nombre: 'Lista Distribuidores', 
    estado: 'Activa', 
    productos: [
      { productoId: 'pt1', precio: 7500 },
      { productoId: 'pt2', precio: 9500 },
      { productoId: 'pt5', precio: 4500 }
    ],
    ultimaActualizacion: { fecha: new Date().toISOString(), usuarioId: '1' }
  },
  { 
    id: 'lp-com', 
    nombre: 'Lista Comercios', 
    estado: 'Activa', 
    productos: [
      { productoId: 'pt1', precio: 8625 },
      { productoId: 'pt2', precio: 10925 },
      { productoId: 'pt5', precio: 5175 }
    ],
    ultimaActualizacion: { fecha: new Date().toISOString(), usuarioId: '1' }
  },
  { 
    id: 'lp-part', 
    nombre: 'Lista Particular', 
    estado: 'Activa', 
    productos: [
      { productoId: 'pt1', precio: 9750 },
      { productoId: 'pt2', precio: 12350 },
      { productoId: 'pt5', precio: 5850 }
    ],
    ultimaActualizacion: { fecha: new Date().toISOString(), usuarioId: '1' }
  }
];

const INITIAL_CLIENTES: Cliente[] = [
  {
    id: 'c1',
    razonSocial: 'Consumidor Final',
    canal: 'Particular',
    listaPrecioId: 'lp-part',
    condicionPago: 'Contado',
    estado: 'Activo',
    sucursales: [{ id: 's1', nombre: 'Mostrador', direccion: 'Venta Directa' }],
    descuentosEspeciales: []
  },
  {
    id: 'c2',
    razonSocial: 'Distribuidora Norte',
    cuit: '30-12345678-9',
    canal: 'Distribuidor',
    listaPrecioId: 'lp-dist',
    condicionPago: 'Cuenta Corriente',
    topeCredito: 1000000,
    estado: 'Activo',
    sucursales: [
      { id: 's2', nombre: 'Depósito Central', direccion: 'Av. San Martín 1234', responsable: 'Carlos' },
      { id: 's3', nombre: 'Sucursal Zona Sur', direccion: 'Av. Mitre 567', horarioEntrega: 'Lunes a viernes 8 a 13hs' }
    ],
    descuentosEspeciales: [{ productoId: 'pt1', porcentaje: 5 }]
  },
  {
    id: 'c3',
    razonSocial: 'Carnicería El Buen Corte',
    cuit: '20-98765432-1',
    canal: 'Comercio',
    listaPrecioId: 'lp-com',
    condicionPago: 'Cuenta Corriente',
    topeCredito: 500000,
    estado: 'Activo',
    sucursales: [{ id: 's4', nombre: 'Local Principal', direccion: 'Calle Corrientes 890' }],
    descuentosEspeciales: []
  },
  {
    id: 'c4',
    razonSocial: 'Juan Pérez',
    canal: 'Particular',
    listaPrecioId: 'lp-part',
    condicionPago: 'Contado',
    estado: 'Activo',
    sucursales: [{ id: 's5', nombre: 'Domicilio', direccion: 'S/D' }],
    descuentosEspeciales: []
  }
];

const INITIAL_VENTAS: Venta[] = [
  { 
    id: 'VTA-20240418-001', 
    puntoVentaId: 'pv1',
    clienteId: 'c2', 
    sucursalId: 's2', 
    fecha: '2024-04-18', 
    comprobante: 'VTA-20240418-001', 
    total: 150000, 
    subtotal: 150000,
    descuentoGeneral: 0,
    tipoDescuentoGeneral: '$',
    totalCobrado: 50000, 
    saldoPendiente: 100000,
    estado: 'Finalizado', 
    estadoCobro: 'Parcial',
    productos: [
      { productoId: 'pt1', codigoBarras: null, cantidad: 10, unidad: 'un', precioUnitario: 7500, descuento: 0, subtotal: 75000 },
      { productoId: 'pt2', codigoBarras: null, cantidad: 10, unidad: 'un', precioUnitario: 9500, descuento: 21.05, subtotal: 75000 }
    ],
    cobros: [
      { monto: 50000, metodo: 'Transferencia', fecha: '2024-04-18', observaciones: 'Pago inicial' }
    ],
    usuario: 'GuidoM',
    fechaCreacion: '2024-04-18T10:00:00Z'
  },
  { 
    id: 'VTA-20240419-001', 
    puntoVentaId: 'pv1',
    clienteId: 'c3', 
    sucursalId: 's4', 
    fecha: '2024-04-19', 
    comprobante: 'VTA-20240419-001', 
    total: 85000, 
    subtotal: 85000,
    descuentoGeneral: 0,
    tipoDescuentoGeneral: '$',
    totalCobrado: 0, 
    saldoPendiente: 85000,
    estado: 'Finalizado', 
    estadoCobro: 'Pendiente',
    productos: [
      { productoId: 'pt5', codigoBarras: null, cantidad: 16.42, unidad: 'kg', precioUnitario: 5175.4, descuento: 0, subtotal: 85000 }
    ],
    cobros: [],
    usuario: 'GuidoM',
    fechaCreacion: '2024-04-19T14:30:00Z'
  }
];

const INITIAL_MOVIMIENTOS: Movimiento[] = [
  {
    id: "MOV-00001",
    tipo: "entrada",
    productoId: "p3", // Pan Rallado
    almacenId: "a3", // Depósito Secos
    cantidad: 500,
    unidad: "kg",
    cantidadKg: 500,
    motivo: "Compra a proveedor",
    loteNumero: "PR-001",
    fechaIngreso: safeFormat(new Date(), 'yyyy-MM-dd'),
    fechaVencimiento: safeFormat(addDays(new Date(), 180), 'yyyy-MM-dd'),
    proveedor: "Molinos del Sur",
    numeroFactura: "FC-0001",
    costoUnitario: 1200,
    origen: "manual",
    usuario: "Gestor Alido",
    fechaHora: new Date().toISOString(),
    anulado: false,
    observaciones: "Stock inicial de ejemplo"
  },
  {
    id: "MOV-00002",
    tipo: "entrada",
    productoId: "mp1", // Pollo Entero
    almacenId: "a1", // Cámara MP
    cantidad: 300,
    unidad: "kg",
    cantidadKg: 300,
    motivo: "Compra a proveedor",
    loteNumero: "POL-001",
    fechaIngreso: safeFormat(new Date(), 'yyyy-MM-dd'),
    fechaVencimiento: safeFormat(addDays(new Date(), 5), 'yyyy-MM-dd'),
    proveedor: "Avícola del Sur",
    numeroFactura: "FC-0002",
    costoUnitario: 3500,
    origen: "manual",
    usuario: "Gestor Alido",
    fechaHora: new Date().toISOString(),
    anulado: false,
    observaciones: "Reserva para producción de milanesas"
  },
  {
    id: "MOV-00003",
    tipo: "entrada",
    productoId: "mp2", // Carne Vacuna
    almacenId: "a1", // Cámara MP
    cantidad: 200,
    unidad: "kg",
    cantidadKg: 200,
    motivo: "Compra a proveedor",
    loteNumero: "CV-001",
    fechaIngreso: safeFormat(new Date(), 'yyyy-MM-dd'),
    fechaVencimiento: safeFormat(addDays(new Date(), 7), 'yyyy-MM-dd'),
    proveedor: "Frigorífico Norte",
    numeroFactura: "FC-0003",
    costoUnitario: 7200,
    origen: "manual",
    usuario: "Gestor Alido",
    fechaHora: new Date().toISOString(),
    anulado: false,
    observaciones: "Piezas enteras para desposte"
  }
];

const INITIAL_LOTES_STOCK: LoteStock[] = [];

const INITIAL_LOTES_PRODUCCION: LoteProduccion[] = [
  { 
    id: 'lp1', 
    numeroLote: 'LOT-20260414-001', 
    productoTerminadoId: 'pt1', 
    cantidadEstimada: 150,
    fechaElaboracion: safeFormat(new Date(), 'yyyy-MM-dd'), 
    fechaVencimiento: safeFormat(addDays(new Date(), 5), 'yyyy-MM-dd'), 
    estado: 'Planificado', 
    responsableId: '1',
    observaciones: 'Lote de prueba planificado',
    insumos: [
      { materiaPrimaId: 'p2', cantidadTeorica: 82.5, cantidadReal: 82.5 },
      { materiaPrimaId: 'p3', cantidadTeorica: 45, cantidadReal: 45 },
      { materiaPrimaId: 'p5', cantidadTeorica: 15, cantidadReal: 15 },
      { materiaPrimaId: 'p6', cantidadTeorica: 7.5, cantidadReal: 7.5 }
    ]
  },
  { 
    id: 'lp2', 
    numeroLote: 'LOT-20260412-001', 
    productoTerminadoId: 'pt2', 
    cantidadEstimada: 200,
    fechaElaboracion: '2026-04-12', 
    fechaVencimiento: '2026-07-12', 
    estado: 'Finalizado', 
    responsableId: '1',
    observaciones: 'Lote finalizado con éxito',
    insumos: [
      { materiaPrimaId: 'p1', cantidadTeorica: 140, cantidadReal: 142, almacenId: 'a1' },
      { materiaPrimaId: 'p3', cantidadTeorica: 30, cantidadReal: 30, almacenId: 'a3' },
      { materiaPrimaId: 'p5', cantidadTeorica: 20, cantidadReal: 20, almacenId: 'a3' },
      { materiaPrimaId: 'p6', cantidadTeorica: 10, cantidadReal: 8, almacenId: 'a3' }
    ],
    pesoBruto: 195,
    pesoNeto: 188,
    almacenDestinoId: 'a2',
    rendimientoReal: 94,
    mermaKg: 12,
    mermaPorcentaje: 6,
    desvioRendimiento: -1,
    fechaFinalizacion: '2026-04-12T16:00:00Z'
  },
  { 
    id: 'lp3', 
    numeroLote: 'LOT-20260415-001', 
    productoTerminadoId: 'pt1', 
    cantidadEstimada: 100,
    fechaElaboracion: safeFormat(new Date(), 'yyyy-MM-dd'), 
    fechaVencimiento: safeFormat(addDays(new Date(), 5), 'yyyy-MM-dd'), 
    estado: 'En Proceso', 
    responsableId: '1',
    observaciones: 'Producción en curso',
    insumos: [
      { materiaPrimaId: 'p2', cantidadTeorica: 55, cantidadReal: 55 },
      { materiaPrimaId: 'p3', cantidadTeorica: 30, cantidadReal: 30 },
      { materiaPrimaId: 'p5', cantidadTeorica: 10, cantidadReal: 10 },
      { materiaPrimaId: 'p6', cantidadTeorica: 5, cantidadReal: 5 }
    ]
  }
];

const INITIAL_LOTES_HISTORIAL: LoteProduccionHistorial[] = [];

const INITIAL_PLANTILLAS_DESPIECE: PlantillaDespiece[] = [
  {
    id: 'pd1',
    materiaPrimaId: 'mp1',
    cortes: [
      { productoId: 'pt5', rendimientoEsperado: 28 },
      { productoId: 'pt6', rendimientoEsperado: 32 },
      { productoId: 'pt7', rendimientoEsperado: 12 },
      { productoId: 'pt8', rendimientoEsperado: 15 }
    ],
    observaciones: 'Rendimiento estándar. Variaciones posibles según tamaño del pollo y habilidad del operario.',
    creadoPor: '1',
    fechaCreacion: '2024-04-10T09:00:00Z'
  },
  {
    id: 'pd2',
    materiaPrimaId: 'mp2',
    cortes: [
      { productoId: 'pt10', rendimientoEsperado: 18 },
      { productoId: 'pt9', rendimientoEsperado: 10 },
      { productoId: 'pt11', rendimientoEsperado: 8 },
      { productoId: 'pt5', rendimientoEsperado: 10 }, // Ejemplo adicional
      { productoId: 'pt6', rendimientoEsperado: 10 }, // Ejemplo adicional
      { productoId: 'pt7', rendimientoEsperado: 12 }  // Ejemplo adicional
    ],
    observaciones: 'Despiece de media res vacuna.',
    creadoPor: '1',
    fechaCreacion: '2024-04-12T10:00:00Z'
  }
];

const INITIAL_PLANTILLAS_DESPIECE_HISTORIAL: PlantillaDespieceHistorial[] = [];

const INITIAL_LOTES_DESPIECE: LoteDespiece[] = [
  {
    id: 'ld1',
    numeroLote: 'DSP-20260410-001',
    materiaPrimaId: 'mp1',
    cantidadIngresada: 150,
    fechaElaboracion: '2026-04-10',
    fechaVencimiento: '2026-04-15',
    estado: 'Finalizado',
    responsableId: '1',
    observaciones: 'Lote de despiece finalizado',
    cortes: [
      { productoId: 'pt5', cantidadEsperada: 42, cantidadReal: 40, almacenDestinoId: 'a1', numeroLoteGenerado: 'DSP-20260410-001-PT5' },
      { productoId: 'pt6', cantidadEsperada: 48, cantidadReal: 47, almacenDestinoId: 'a1', numeroLoteGenerado: 'DSP-20260410-001-PT6' },
      { productoId: 'pt7', cantidadEsperada: 18, cantidadReal: 17, almacenDestinoId: 'a1', numeroLoteGenerado: 'DSP-20260410-001-PT7' },
      { productoId: 'pt8', cantidadEsperada: 22.5, cantidadReal: 23, almacenDestinoId: 'a1', numeroLoteGenerado: 'DSP-20260410-001-PT8' }
    ],
    rendimientoReal: 84.7,
    mermaKg: 23,
    mermaPorcentaje: 15.3,
    fechaFinalizacion: '2026-04-10T16:00:00Z'
  },
  {
    id: 'ld2',
    numeroLote: 'DSP-20260415-001',
    materiaPrimaId: 'mp1',
    cantidadIngresada: 200,
    fechaElaboracion: safeFormat(new Date(), 'yyyy-MM-dd'),
    fechaVencimiento: safeFormat(addDays(new Date(), 5), 'yyyy-MM-dd'),
    estado: 'Planificado',
    responsableId: '1',
    observaciones: 'Lote planificado',
    cortes: [
      { productoId: 'pt5', cantidadEsperada: 56, cantidadReal: 0 },
      { productoId: 'pt6', cantidadEsperada: 64, cantidadReal: 0 },
      { productoId: 'pt7', cantidadEsperada: 24, cantidadReal: 0 },
      { productoId: 'pt8', cantidadEsperada: 30, cantidadReal: 0 }
    ]
  },
  {
    id: 'ld3',
    numeroLote: 'DSP-20260414-001',
    materiaPrimaId: 'mp2',
    cantidadIngresada: 120,
    fechaElaboracion: '2026-04-14',
    fechaVencimiento: '2026-04-21',
    estado: 'En Proceso',
    responsableId: '1',
    observaciones: 'Despiece en curso',
    cortes: [
      { productoId: 'pt10', cantidadEsperada: 21.6, cantidadReal: 20 },
      { productoId: 'pt9', cantidadEsperada: 12, cantidadReal: 10 }
    ]
  }
];

const INITIAL_LOTES_DESPIECE_HISTORIAL: LoteDespieceHistorial[] = [];

// --- Egresos Initial Data ---

const INITIAL_PLAN_CUENTAS: PlanCuenta[] = [
  { id: 'pc1', codigo: '5.000', nombre: 'COSTOS', nivel: 1, parentId: null, tipo: 'Costo', estado: 'Activa' },
  { id: 'pc2', codigo: '5.100', nombre: 'Costo de Materia Prima', nivel: 2, parentId: 'pc1', estado: 'Activa' },
  { id: 'pc3', codigo: '5.101', nombre: 'Compra de Pollo', nivel: 3, parentId: 'pc2', estado: 'Activa' },
  { id: 'pc4', codigo: '5.102', nombre: 'Compra de Carne Vacuna', nivel: 3, parentId: 'pc2', estado: 'Activa' },
  { id: 'pc5', codigo: '5.103', nombre: 'Compra de Insumos Secos', nivel: 3, parentId: 'pc2', estado: 'Activa' },
  { id: 'pc6', codigo: '5.200', nombre: 'Costo de Envases', nivel: 2, parentId: 'pc1', estado: 'Activa' },
  { id: 'pc7', codigo: '5.201', nombre: 'Envases y Packaging', nivel: 3, parentId: 'pc6', estado: 'Activa' },
  { id: 'pc8', codigo: '6.000', nombre: 'GASTOS OPERATIVOS', nivel: 1, parentId: null, tipo: 'Gasto', estado: 'Activa' },
  { id: 'pc9', codigo: '6.100', nombre: 'Sueldos y Cargas Sociales', nivel: 2, parentId: 'pc8', estado: 'Activa' },
  { id: 'pc10', codigo: '6.101', nombre: 'Sueldos', nivel: 3, parentId: 'pc9', estado: 'Activa' },
  { id: 'pc11', codigo: '6.102', nombre: 'Cargas Sociales', nivel: 3, parentId: 'pc9', estado: 'Activa' },
  { id: 'pc12', codigo: '6.200', nombre: 'Servicios', nivel: 2, parentId: 'pc8', estado: 'Activa' },
  { id: 'pc13', codigo: '6.201', nombre: 'Electricidad', nivel: 3, parentId: 'pc12', estado: 'Activa' },
  { id: 'pc14', codigo: '6.202', nombre: 'Gas', nivel: 3, parentId: 'pc12', estado: 'Activa' },
  { id: 'pc15', codigo: '6.203', nombre: 'Agua', nivel: 3, parentId: 'pc12', estado: 'Activa' },
  { id: 'pc16', codigo: '6.300', nombre: 'Mantenimiento', nivel: 2, parentId: 'pc8', estado: 'Activa' },
  { id: 'pc17', codigo: '6.301', nombre: 'Mantenimiento de Maquinaria', nivel: 3, parentId: 'pc16', estado: 'Activa' },
  { id: 'pc18', codigo: '6.400', nombre: 'Impuestos y Tasas', nivel: 2, parentId: 'pc8', estado: 'Activa' },
  { id: 'pc19', codigo: '6.401', nombre: 'Impuestos Nacionales', nivel: 3, parentId: 'pc18', estado: 'Activa' },
  { id: 'pc20', codigo: '6.500', nombre: 'Fletes y Logística', nivel: 2, parentId: 'pc8', estado: 'Activa' },
  { id: 'pc21', codigo: '6.501', nombre: 'Fletes', nivel: 3, parentId: 'pc20', estado: 'Activa' },
  { id: 'pc22', codigo: '6.600', nombre: 'Otros Gastos', nivel: 2, parentId: 'pc8', estado: 'Activa' },
  { id: 'pc23', codigo: '6.601', nombre: 'Gastos Varios', nivel: 3, parentId: 'pc22', estado: 'Activa' }
];

const INITIAL_TIPOS_EGRESO: TipoEgreso[] = [
  { id: 'te1', nombre: 'Compra de Materia Prima', color: 'emerald', cuentaContableDefectoId: 'pc3', impactaInventario: true, estado: 'Activo' },
  { id: 'te2', nombre: 'Sueldos', color: 'blue', cuentaContableDefectoId: 'pc10', impactaInventario: false, estado: 'Activo' },
  { id: 'te3', nombre: 'Servicios', color: 'orange', cuentaContableDefectoId: 'pc13', impactaInventario: false, estado: 'Activo' },
  { id: 'te4', nombre: 'Envases y Packaging', color: 'violet', cuentaContableDefectoId: 'pc7', impactaInventario: true, estado: 'Activo' },
  { id: 'te5', nombre: 'Alquiler', color: 'slate', impactaInventario: false, estado: 'Activo' },
  { id: 'te6', nombre: 'Impuestos', color: 'rose', cuentaContableDefectoId: 'pc19', impactaInventario: false, estado: 'Activo' },
  { id: 'te7', nombre: 'Fletes', color: 'amber', cuentaContableDefectoId: 'pc21', impactaInventario: false, estado: 'Activo' },
  { id: 'te8', nombre: 'Mantenimiento', color: 'sky', cuentaContableDefectoId: 'pc17', impactaInventario: false, estado: 'Activo' },
  { id: 'te9', nombre: 'Otros', color: 'gray', cuentaContableDefectoId: 'pc23', impactaInventario: false, estado: 'Activo' }
];

const INITIAL_PROVEEDORES: Proveedor[] = [
  { id: 'pr1', razonSocial: 'Avícola del Sur', cuit: '30-11111111-1', rubro: 'Avícola', condicionPago: 'Cuenta Corriente', plazoPagoHabitual: 15, estado: 'Activo', tipoEgresoDefectoId: 'te1', cuentaContableDefectoId: 'pc3' },
  { id: 'pr2', razonSocial: 'Frigorífico Norte', cuit: '30-22222222-2', rubro: 'Frigorífico', condicionPago: 'Cuenta Corriente', plazoPagoHabitual: 30, estado: 'Activo', tipoEgresoDefectoId: 'te1', cuentaContableDefectoId: 'pc4' },
  { id: 'pr3', razonSocial: 'Molinos del Sur', cuit: '30-33333333-3', rubro: 'Insumos Secos', condicionPago: 'Contado', estado: 'Activo', tipoEgresoDefectoId: 'te1', cuentaContableDefectoId: 'pc5' },
  { id: 'pr4', razonSocial: 'Edenor', cuit: '30-44444444-4', rubro: 'Servicios', condicionPago: 'Contado', estado: 'Activo', tipoEgresoDefectoId: 'te3', cuentaContableDefectoId: 'pc13' }
];

const INITIAL_EGRESOS: Egreso[] = [
  {
    id: 'eg1',
    comprobante: 'EGR-20240420-001',
    fecha: '2024-04-20',
    tipoEgresoId: 'te1',
    cuentaContableId: 'pc3',
    proveedorId: 'pr1',
    items: [
      { id: 'ei1', productoId: 'mp1', cantidad: 100, precioUnitario: 3500, subtotal: 350000, loteProveedor: 'L-POL-99', fechaVencimiento: '2024-04-25' }
    ],
    neto: 350000,
    tipoIva: 'IVA 10,5%',
    iva: 36750,
    total: 386750,
    estado: 'Confirmado',
    estadoPago: 'Pendiente',
    usuario: 'Administrador',
    fechaCreacion: '2024-04-20T10:00:00Z'
  }
];

const INITIAL_PAGOS_PROVEEDORES: PagoProveedor[] = [];
const INITIAL_PLANTILLAS_EGRESOS: PlantillaEgreso[] = [];
const INITIAL_MERCADERIA_PENDIENTE: MercaderiaPendiente[] = [];

// --- Components ---

function formatNum(valor: any, decimales: number = 3) {
  const num = parseFloat(valor);
  if (isNaN(num)) return 0;
  const factor = Math.pow(10, decimales);
  return Math.round(num * factor) / factor;
}

function displayNum(valor: any, decimales: number = 3) {
  const num = formatNum(valor, decimales);
  return num.toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimales
  });
}

const Modal = ({ isOpen, onClose, title, children, className }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode, className?: string }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-sleek-dark/60 backdrop-blur-sm p-4">
      <div className={cn("bg-white rounded shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border-t-8 border-sleek-accent", className)}>
        <div className={cn("px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white", className?.includes('modal-egreso') && 'modal-egreso-header')}>
          <h3 className="text-sm font-bold text-sleek-dark uppercase tracking-widest">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded transition-all text-slate-400 hover:text-sleek-dark">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <div className={cn("p-8 overflow-y-auto custom-scrollbar", className?.includes('modal-egreso') && 'modal-egreso-body')}>
          {children}
        </div>
      </div>
    </div>
  );
};

const Card = ({ children, className, onClick }: { children: React.ReactNode, className?: string, onClick?: () => void, key?: any }) => (
  <div 
    onClick={onClick}
    className={cn(
      "bg-white rounded shadow-sm border border-slate-100 overflow-hidden transition-all duration-300", 
      onClick && "cursor-pointer hover:border-sleek-accent hover:shadow-xl hover:-translate-y-1",
      className
    )}
  >
    {children}
  </div>
);

const Badge = ({ children, variant = 'default', className }: { children: React.ReactNode, variant?: 'default' | 'success' | 'warning' | 'danger' | 'info', className?: string }) => {
  const variants = {
    default: 'bg-slate-100 text-slate-700',
    success: 'bg-sleek-success/10 text-sleek-success',
    warning: 'bg-sleek-warning/10 text-sleek-warning',
    danger: 'bg-sleek-danger/10 text-sleek-danger',
    info: 'bg-sky-100 text-sky-700'
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider", variants[variant], className)}>
      {children}
    </span>
  );
};

const ProgressBar = ({ value, max, label }: { value: number, max: number, label?: string }) => {
  const safeValue = value || 0;
  const safeMax = max || 1;
  const percentage = Math.min(Math.round((safeValue / safeMax) * 100), 100);
  const displayPercentage = isNaN(percentage) ? 0 : percentage;
  let colorClass = 'bg-sleek-success';
  if (displayPercentage > 90) colorClass = 'bg-sleek-danger';
  else if (displayPercentage > 70) colorClass = 'bg-sleek-warning';

  return (
    <div className="w-full">
      <div className="flex justify-between text-[11px] mb-1">
        <span className="font-bold text-slate-500 uppercase">{label}</span>
        <span className="font-bold text-slate-800">{displayPercentage}%</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2 border border-slate-200">
        <div 
          className={cn("h-full rounded-full transition-all duration-500", colorClass)} 
          style={{ width: `${displayPercentage}%` }}
        />
      </div>
    </div>
  );
};

// --- Helper for LocalStorage ---
const loadData = (key: string, initial: any) => {
  if (typeof window === 'undefined') return initial;
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : initial;
};

const robustLoadLotesDespiece = (initial: any) => {
  if (typeof window === 'undefined') return initial;
  const posiblesClaves = [
    'alido_lotes_despiece',
    'alido_despiece',
    'alido_lotes_desp',
    'alido_lotesDespiece'
  ];
  
  let todosLosLotes: any[] = [];
  
  for (const clave of posiblesClaves) {
    try {
      const stored = localStorage.getItem(clave);
      if (stored) {
        const datos = JSON.parse(stored);
        if (Array.isArray(datos)) {
          // Normalizar cada lote al cargarlo
          const normalizados = datos.map(l => ({
            ...l,
            id: l.id || l.numeroLote || l.numero || `mig-${Date.now()}-${Math.random()}`,
            numeroLote: l.numeroLote || l.numero || l.id || 'S/N',
            materiaPrimaId: l.materiaPrimaId || l.materiaPrima || l.mpDespostada,
            cantidadIngresada: parseFloat(l.cantidadIngresada || l.cantidad || l.pesoIngresado || 0),
            estado: l.estado || l.status || 'Finalizado',
            fechaElaboracion: l.fechaElaboracion || l.fecha || l.fechaCreacion || new Date().toISOString()
          }));
          todosLosLotes = todosLosLotes.concat(normalizados);
        }
      }
    } catch (e) {
      console.error(`Error cargando clave ${clave}:`, e);
    }
  }
  
  if (todosLosLotes.length === 0) return initial;

  // Eliminar duplicados por ID (o numeroLote si ID es autogenerado)
  const unique = new Map();
  todosLosLotes.forEach(l => {
    // Preferir registros más completos o con IDs establecidos
    const existing = unique.get(l.id);
    if (!existing || (l.estado === 'Finalizado' && existing.estado !== 'Finalizado')) {
      unique.set(l.id, l);
    }
  });
  
  return Array.from(unique.values());
};

const getLoteField = (lote: any, campo: string) => {
  if (!lote) return null;
  const mapeos: Record<string, string[]> = {
    'id': ['id', 'numero', 'loteNumero', 'loteId', 'nroLote'],
    'materia_prima': ['materiaPrimaId', 'materiaPrima', 'mpDespostada', 'producto', 'productoId'],
    'cantidad': ['cantidadIngresada', 'cantidad', 'cantIngresada', 'pesoIngresado'],
    'estado': ['estado', 'status'],
    'fecha': ['fechaElaboracion', 'fecha', 'fechaCreacion'],
    'vencimiento': ['fechaVencimiento', 'vencimiento'],
    'responsable': ['responsableId', 'responsable', 'operario', 'usuario']
  };
  
  const nombres = mapeos[campo] || [campo];
  for (const nombre of nombres) {
    if (lote[nombre] !== undefined && lote[nombre] !== null) {
      return lote[nombre];
    }
  }
  return null;
};

// --- Productos View ---

const ProductosView = ({ 
  productos, setProductos, 
  familias, setFamilias, 
  subfamilias, setSubfamilias, 
  unidades, setUnidades,
  showNotification 
}: any) => {
  const [activeTab, setActiveTab] = useState('Catálogo');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [editingItem, setEditingItem] = useState<any>(null);

  const tabs = [
    { id: 'Catálogo', label: 'Catálogo de Productos' },
    { id: 'Familias', label: 'Familias y Subfamilias' },
    { id: 'Unidades', label: 'Unidades de Medida' }
  ];

  return (
    <div className="space-y-8">
      <div className="flex border-b border-slate-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-6 py-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2",
              activeTab === tab.id 
                ? "border-sleek-accent text-sleek-accent bg-sleek-accent/5" 
                : "border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        {activeTab === 'Catálogo' && (
          <CatalogoTab 
            productos={productos} 
            setProductos={setProductos}
            familias={familias}
            subfamilias={subfamilias}
            unidades={unidades}
            showNotification={showNotification}
            setActiveTab={setActiveTab}
          />
        )}
        {activeTab === 'Familias' && (
          <FamiliasTab 
            familias={familias} 
            setFamilias={setFamilias}
            subfamilias={subfamilias}
            setSubfamilias={setSubfamilias}
            productos={productos}
            showNotification={showNotification}
          />
        )}
        {activeTab === 'Unidades' && (
          <UnidadesTab 
            unidades={unidades} 
            setUnidades={setUnidades}
            productos={productos}
            showNotification={showNotification}
          />
        )}
      </div>
    </div>
  );
};

// --- Sub-tabs for Productos ---

const CatalogoTab = ({ productos, setProductos, familias, subfamilias, unidades, showNotification, setActiveTab }: any) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProducto, setEditingProducto] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTipo, setFilterTipo] = useState('Todos');
  const [filterOrigen, setFilterOrigen] = useState('Todos');
  const [filterFamilia, setFilterFamilia] = useState('Todas');
  const [filterSubfamilia, setFilterSubfamilia] = useState('Todas');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [formData, setFormData] = useState<any>({
    codigo: '',
    nombre: '',
    tipo: 'Materia Prima',
    origen: 'Producción propia',
    familiaId: '',
    subfamiliaId: '',
    unidadMedidaId: '',
    descripcion: '',
    alergenos: [],
    condicionAlmacenamiento: 'Ambiente',
    vidaUtil: { valor: 0, unidad: 'días' },
    precioReferencia: 0,
    proveedor: '',
    pesoNetoUnidad: 0,
    pesoBrutoUnidad: 0,
    ean13: '',
    usoCruzado: false,
    pesoEquivalenteKg: 1
  });

  const generateNextCodigo = () => {
    const lastNum = productos.reduce((max: number, p: any) => {
      const match = p.codigo.match(/PROD-(\d+)/);
      return match ? Math.max(max, parseInt(match[1])) : max;
    }, 0);
    return `PROD-${(lastNum + 1).toString().padStart(3, '0')}`;
  };

  const handleOpenModal = (prod = null) => {
    if (prod) {
      setEditingProducto(prod);
      setFormData({ ...prod });
    } else {
      setEditingProducto(null);
      setFormData({
        codigo: generateNextCodigo(),
        nombre: '',
        tipo: 'Materia Prima',
        origen: 'Producción propia',
        familiaId: '',
        subfamiliaId: '',
        unidadMedidaId: '',
        descripcion: '',
        alergenos: [],
        condicionAlmacenamiento: 'Ambiente',
        vidaUtil: { valor: 0, unidad: 'días' },
        precioReferencia: 0,
        proveedor: '',
        pesoNetoUnidad: 0,
        pesoBrutoUnidad: 0,
        ean13: '',
        usoCruzado: false,
        pesoEquivalenteKg: 1
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!formData.nombre || !formData.tipo || !formData.familiaId || !formData.subfamiliaId || !formData.unidadMedidaId) {
      showNotification('Por favor complete los campos obligatorios', 'error');
      return;
    }

    if (editingProducto) {
      setProductos(productos.map((p: any) => p.id === editingProducto.id ? { ...p, ...formData } : p));
      showNotification('Producto actualizado', 'success');
    } else {
      const newProd = { id: `p-${Date.now()}`, ...formData };
      setProductos([...productos, newProd]);
      showNotification('Producto creado', 'success');
    }
    setIsModalOpen(false);
  };

  const handleDelete = (prod: any) => {
    confirmDialog(`¿Estás seguro de eliminar el producto ${prod.nombre}? Esta acción no se puede deshacer.`, () => {
      setProductos(productos.filter((p: any) => p.id !== prod.id));
      showNotification('Producto eliminado', 'success');
    });
  };

  const filteredProductos = productos.filter((p: any) => {
    const matchesSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          familias.find((f: any) => f.id === p.familiaId)?.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          subfamilias.find((s: any) => s.id === p.subfamiliaId)?.nombre.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTipo = filterTipo === 'Todos' || p.tipo === filterTipo;
    const matchesOrigen = filterOrigen === 'Todos' || p.origen === filterOrigen;
    const matchesFamilia = filterFamilia === 'Todas' || p.familiaId === filterFamilia;
    const matchesSubfamilia = filterSubfamilia === 'Todas' || p.subfamiliaId === filterSubfamilia;
    return matchesSearch && matchesTipo && matchesOrigen && matchesFamilia && matchesSubfamilia;
  });

  const paginatedProductos = filteredProductos.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(filteredProductos.length / itemsPerPage);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-4 items-center flex-1">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar por nombre, código..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent transition-all"
            />
          </div>
          <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="px-4 py-2 bg-white border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent">
            <option value="Todos">Todos los Tipos</option>
            <option value="Materia Prima">Materia Prima</option>
            <option value="Producto Terminado">Producto Terminado</option>
          </select>
          <select value={filterOrigen} onChange={e => setFilterOrigen(e.target.value)} className="px-4 py-2 bg-white border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent">
            <option value="Todos">Todos los Orígenes</option>
            <option value="Producción propia">Producción propia</option>
            <option value="Reventa">Reventa</option>
            <option value="Despiece">Despiece</option>
          </select>
          <select value={filterFamilia} onChange={e => setFilterFamilia(e.target.value)} className="px-4 py-2 bg-white border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent">
            <option value="Todas">Todas las Familias</option>
            {familias.map((f: any) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-sleek-dark text-white px-6 py-2 rounded font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nuevo Producto
        </button>
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Código</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nombre</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tipo</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Origen</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Familia</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Subfamilia</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">U.M.</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginatedProductos.map((p: any) => (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-xs font-mono font-bold text-slate-400">{p.codigo}</td>
                  <td className="px-6 py-4 text-sm font-bold text-sleek-dark">
                    <div className="flex items-center gap-2">
                      {p.nombre}
                      {p.usoCruzado && (
                        <ArrowRightLeft className="w-3 h-3 text-sleek-accent" title="Uso cruzado habilitado" />
                      )}
                    </div>
                    {p.unidadMedidaId !== 'u1' && p.pesoEquivalenteKg && p.pesoEquivalenteKg !== 1 && (
                      <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">
                        Equivalencia: 1 {unidades.find((u: any) => u.id === p.unidadMedidaId)?.abreviatura} = {formatNum(p.pesoEquivalenteKg)} kg
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Badge variant={p.tipo === 'Materia Prima' ? 'info' : 'success'}>{p.tipo}</Badge>
                      {p.usoCruzado && <span className="text-[10px] bg-slate-100 text-slate-500 px-1 rounded uppercase font-bold">Mix</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {p.tipo === 'Producto Terminado' ? (
                      <Badge variant={
                        p.origen === 'Producción propia' ? 'info' : 
                        p.origen === 'Reventa' ? 'default' : 'warning'
                      }>
                        {p.origen === 'Producción propia' ? '🏭 Propia' : 
                         p.origen === 'Reventa' ? '📦 Reventa' : '🔪 Despiece'}
                      </Badge>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500">{familias.find((f: any) => f.id === p.familiaId)?.nombre || '-'}</td>
                  <td className="px-6 py-4 text-xs text-slate-500">{subfamilias.find((s: any) => s.id === p.subfamiliaId)?.nombre || '-'}</td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">
                    {unidades.find((u: any) => u.id === p.unidadMedidaId)?.abreviatura || '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleOpenModal(p)} className="p-2 text-slate-400 hover:text-sleek-accent transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(p)} className="p-2 text-slate-400 hover:text-sleek-danger transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center bg-slate-50/30">
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
            Mostrando {paginatedProductos.length} de {filteredProductos.length} productos
          </p>
          <div className="flex gap-2">
            <button 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
              className="p-2 border border-slate-200 rounded disabled:opacity-30 hover:bg-white transition-all"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
            </button>
            <button 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(currentPage + 1)}
              className="p-2 border border-slate-200 rounded disabled:opacity-30 hover:bg-white transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </Card>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingProducto ? 'Editar Producto' : 'Nuevo Producto'}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Código</label>
              <input type="text" value={formData.codigo || ''} onChange={e => setFormData({ ...formData, codigo: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Nombre del Producto *</label>
              <input type="text" value={formData.nombre || ''} onChange={e => setFormData({ ...formData, nombre: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent" />
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="flex items-center gap-2 cursor-pointer group p-3 bg-slate-50 rounded border border-slate-200 hover:border-sleek-accent transition-all">
              <input 
                type="checkbox" 
                checked={formData.usoCruzado}
                onChange={e => setFormData({ ...formData, usoCruzado: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-sleek-accent focus:ring-sleek-accent"
              />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-sleek-dark">Habilitar uso cruzado</span>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {formData.tipo === 'Producto Terminado' 
                    ? "Al activar esta opción, este producto también podrá seleccionarse como ingrediente en Recetas Estándar y Lotes de Producción, además de estar disponible para la venta."
                    : "Al activar esta opción, este producto también podrá venderse directamente a clientes, además de usarse como insumo en producción."}
                </p>
              </div>
            </label>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Tipo *</label>
            <select value={formData.tipo || 'Materia Prima'} onChange={e => setFormData({ ...formData, tipo: e.target.value, origen: e.target.value === 'Producto Terminado' ? 'Producción propia' : undefined })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent">
              <option value="Materia Prima">Materia Prima</option>
              <option value="Producto Terminado">Producto Terminado</option>
            </select>
          </div>

          {formData.tipo === 'Producto Terminado' && (
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Origen del Producto *</label>
              <select 
                value={formData.origen || 'Producción propia'} 
                onChange={e => setFormData({ ...formData, origen: e.target.value })} 
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent"
              >
                <option value="Producción propia">Producción propia</option>
                <option value="Reventa">Reventa</option>
                <option value="Despiece">Despiece</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Unidad de Medida *</label>
            {unidades.length === 0 ? (
              <p className="text-xs text-sleek-danger">No hay unidades. <button onClick={() => setActiveTab('Unidades')} className="underline">Crear una</button></p>
            ) : (
              <select value={formData.unidadMedidaId || ''} onChange={e => setFormData({ ...formData, unidadMedidaId: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent">
                <option value="">Seleccionar Unidad</option>
                {unidades.map((u: any) => <option key={u.id} value={u.id}>{u.nombre} ({u.abreviatura})</option>)}
              </select>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Familia *</label>
            {familias.length === 0 ? (
              <p className="text-xs text-sleek-danger">No hay familias. <button onClick={() => setActiveTab('Familias')} className="underline">Crear una</button></p>
            ) : (
              <select value={formData.familiaId || ''} onChange={e => setFormData({ ...formData, familiaId: e.target.value, subfamiliaId: '' })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent">
                <option value="">Seleccionar Familia</option>
                {familias.map((f: any) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
              </select>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Subfamilia *</label>
            {!formData.familiaId ? (
              <p className="text-xs text-slate-400 italic">Seleccione una familia primero</p>
            ) : subfamilias.filter((s: any) => s.familiaId === formData.familiaId).length === 0 ? (
              <p className="text-xs text-sleek-danger">Sin subfamilias. <button onClick={() => setActiveTab('Familias')} className="underline">Crear una</button></p>
            ) : (
              <select value={formData.subfamiliaId || ''} onChange={e => setFormData({ ...formData, subfamiliaId: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent">
                <option value="">Seleccionar Subfamilia</option>
                {subfamilias.filter((s: any) => s.familiaId === formData.familiaId).map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Descripción</label>
            <textarea 
              value={formData.descripcion || ''} 
              onChange={e => setFormData({ ...formData, descripcion: e.target.value })} 
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent h-20" 
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Alérgenos</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {ALERGENOS_OPTIONS.map(a => (
                <label key={a} className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={formData.alergenos.includes(a)}
                    onChange={e => {
                      const newAlergenos = e.target.checked 
                        ? [...formData.alergenos, a]
                        : formData.alergenos.filter((item: string) => item !== a);
                      setFormData({ ...formData, alergenos: newAlergenos });
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-sleek-accent focus:ring-sleek-accent"
                  />
                  <span className="text-xs text-slate-600 group-hover:text-sleek-dark transition-colors">{a}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Condición de Almacenamiento</label>
            <select value={formData.condicionAlmacenamiento} onChange={e => setFormData({ ...formData, condicionAlmacenamiento: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent">
              {CONDICIONES_ALMACENAMIENTO.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Vida Útil Estándar</label>
              <div className="flex gap-2">
                <input type="number" value={formData.vidaUtil.valor || 0} onChange={e => setFormData({ ...formData, vidaUtil: { ...formData.vidaUtil, valor: parseInt(e.target.value) || 0 } })} className="w-20 px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent" />
                <select 
                  value={formData.vidaUtil.unidad || 'Días'} 
                  onChange={e => setFormData({ ...formData, vidaUtil: { ...formData.vidaUtil, unidad: e.target.value } })} 
                  className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent"
                >
                  <option value="días">días</option>
                  <option value="meses">meses</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Precio de Referencia</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input type="number" value={formData.precioReferencia || 0} onChange={e => setFormData({ ...formData, precioReferencia: parseFloat(e.target.value) || 0 })} className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent" />
              </div>
            </div>

            {formData.tipo === 'Materia Prima' && (
              <>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Proveedor</label>
                  <input type="text" value={formData.proveedor || ''} onChange={e => setFormData({ ...formData, proveedor: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent" />
                </div>
                {formData.unidadMedidaId !== 'u1' && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Peso equivalente en kg por unidad *</label>
                    <input type="number" step="0.001" value={formData.pesoEquivalenteKg || 0} onChange={e => setFormData({ ...formData, pesoEquivalenteKg: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent" />
                    {(formData.pesoEquivalenteKg || 0) <= 0 && (
                      <p className="text-[9px] text-sleek-danger font-bold uppercase mt-1">
                        ⚠️ Requerido para cálculos internos (Kg)
                      </p>
                    )}
                    <p className="text-[9px] text-slate-400 mt-1 leading-tight">
                      Indicá cuántos kilogramos equivale una unidad de este producto. Este valor se usará para cálculos de rendimiento y ocupación. 
                      Si la unidad es peso variable, cargá un peso promedio referencial.
                    </p>
                  </div>
                )}
              </>
            )}

            {formData.tipo === 'Producto Terminado' && (
              <>
                <div className="md:col-span-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Peso Neto (kg) / Factor Conv. *</label>
                  <input type="number" step="0.001" value={formData.pesoNetoUnidad || 0} onChange={e => setFormData({ ...formData, pesoNetoUnidad: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent" />
                  {(formData.pesoNetoUnidad || 0) <= 0 && formData.unidadMedidaId !== 'u1' && (
                    <p className="text-[9px] text-sleek-danger font-bold uppercase mt-1">
                      ⚠️ Requerido para cálculos internos (Kg)
                    </p>
                  )}
                  <p className="text-[9px] text-slate-400 mt-1 leading-tight">
                    Este valor se utilizará para todos los cálculos del sistema que requieran convertir este producto a kilogramos (rendimientos, ocupación, etc.).
                  </p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Peso Bruto (kg)</label>
                  <input type="number" step="0.001" value={formData.pesoBrutoUnidad || 0} onChange={e => setFormData({ ...formData, pesoBrutoUnidad: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent" />
                </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Código EAN-13</label>
                <div className="flex gap-2">
                  <input type="text" value={formData.ean13 || ''} onChange={e => setFormData({ ...formData, ean13: e.target.value })} className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent" />
                  <button 
                    onClick={() => {
                      const random = Math.floor(Math.random() * 1000000000000).toString().padStart(12, '0');
                      let sum = 0;
                      for (let i = 0; i < 12; i++) sum += parseInt(random[i]) * (i % 2 === 0 ? 1 : 3);
                      const checkDigit = (10 - (sum % 10)) % 10;
                      setFormData({ ...formData, ean13: random + checkDigit });
                    }}
                    className="p-2 bg-slate-100 rounded hover:bg-slate-200 transition-all"
                  >
                    <ArrowRightLeft className="w-4 h-4 text-slate-600" />
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="md:col-span-2 flex justify-end gap-3 pt-6 border-t border-slate-100">
            <button onClick={() => setIsModalOpen(false)} className="px-6 py-2 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600">Cancelar</button>
            <button onClick={handleSave} className="px-10 py-2 bg-sleek-dark text-white text-xs font-bold uppercase tracking-widest rounded hover:bg-slate-800 transition-all shadow-lg shadow-sleek-dark/20">Guardar Producto</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

const RecetasProduccionView = ({ 
  recetas, setRecetas, 
  recetasHistorial, setRecetasHistorial,
  productos, familias, subfamilias, unidades, 
  currentUser, showNotification, getPesoEquivalente
}: any) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [editingReceta, setEditingReceta] = useState<any>(null);
  const [selectedRecetaForHistory, setSelectedRecetaForHistory] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFamilia, setFilterFamilia] = useState('Todas');
  const [filterSubfamilia, setFilterSubfamilia] = useState('Todas');

  const [formData, setFormData] = useState<any>({
    productoTerminadoId: '',
    cantidadBase: 100,
    rendimientoEsperado: 100,
    insumos: [],
    observaciones: ''
  });

  const handleOpenModal = (receta = null) => {
    if (receta) {
      setEditingReceta(receta);
      setFormData({ ...receta });
    } else {
      setEditingReceta(null);
      setFormData({
        productoTerminadoId: '',
        cantidadBase: 100,
        rendimientoEsperado: 100,
        insumos: [],
        observaciones: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleAddInsumo = () => {
    setFormData({
      ...formData,
      insumos: [...formData.insumos, { materiaPrimaId: '', cantidad: 0 }]
    });
  };

  const handleRemoveInsumo = (index: number) => {
    setFormData({
      ...formData,
      insumos: formData.insumos.filter((_: any, i: number) => i !== index)
    });
  };

  const handleInsumoChange = (index: number, field: string, value: any) => {
    const newInsumos = [...formData.insumos];
    newInsumos[index] = { ...newInsumos[index], [field]: value };
    setFormData({ ...formData, insumos: newInsumos });
  };

  const totalInsumos = formData.insumos.reduce((sum: number, ins: any) => sum + (parseFloat(ins.cantidad) * getPesoEquivalente(ins.materiaPrimaId) || 0), 0);
  const prodBase = productos.find((p: any) => p.id === formData.productoTerminadoId);
  const factorBase = prodBase ? getPesoEquivalente(prodBase.id) : 1;
  const rendimientoTeorico = totalInsumos > 0 ? (formData.cantidadBase / totalInsumos) * 100 : 0;

  const handleSave = () => {
    if (!formData.productoTerminadoId || formData.insumos.length === 0) {
      showNotification('Complete el producto terminado y al menos un ingrediente', 'error');
      return;
    }

    const alreadyHasReceta = recetas.some((r: any) => r.productoTerminadoId === formData.productoTerminadoId && (!editingReceta || r.id !== editingReceta.id));
    if (alreadyHasReceta) {
      showNotification('Este producto ya tiene una receta asignada', 'error');
      return;
    }

    const now = new Date().toISOString();
    const detail = editingReceta 
      ? `Modificación de receta: ${productos.find((p: any) => p.id === formData.productoTerminadoId)?.nombre}`
      : `Creación de receta: ${productos.find((p: any) => p.id === formData.productoTerminadoId)?.nombre}`;

    if (editingReceta) {
      const updatedReceta = { 
        ...editingReceta, 
        ...formData, 
        ultimaModificacion: { fecha: now, usuarioId: currentUser.id } 
      };
      setRecetas(recetas.map((r: any) => r.id === editingReceta.id ? updatedReceta : r));
      
      const historyEntry: RecetaHistorial = {
        id: `rh-${Date.now()}`,
        recetaId: editingReceta.id,
        fecha: now,
        usuarioId: currentUser.id,
        accion: 'Modificación',
        detalle: detail
      };
      setRecetasHistorial([historyEntry, ...recetasHistorial]);
      showNotification('Receta actualizada', 'success');
    } else {
      const newId = `r-${Date.now()}`;
      const newReceta = { 
        ...formData, 
        id: newId,
        creadoPor: currentUser.id,
        fechaCreacion: now,
        ultimaModificacion: { fecha: now, usuarioId: currentUser.id }
      };
      setRecetas([...recetas, newReceta]);

      const historyEntry: RecetaHistorial = {
        id: `rh-${Date.now()}`,
        recetaId: newId,
        fecha: now,
        usuarioId: currentUser.id,
        accion: 'Creación',
        detalle: detail
      };
      setRecetasHistorial([historyEntry, ...recetasHistorial]);
      showNotification('Receta creada', 'success');
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    confirmDialog('¿Eliminar esta receta? No afectará a los lotes ya creados.', () => {
      setRecetas(recetas.filter((r: any) => r.id !== id));
      showNotification('Receta eliminada', 'success');
    });
  };

  const filteredRecetas = recetas.filter((r: any) => {
    const prod = productos.find((p: any) => p.id === r.productoTerminadoId);
    if (!prod) return false;
    
    const matchesSearch = prod.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         prod.codigo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFamilia = filterFamilia === 'Todas' || prod.familiaId === filterFamilia;
    const matchesSubfamilia = filterSubfamilia === 'Todas' || prod.subfamiliaId === filterSubfamilia;
    
    return matchesSearch && matchesFamilia && matchesSubfamilia;
  });

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-sleek-dark uppercase tracking-widest">Recetas Estándar</h2>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-sleek-dark text-white px-6 py-2 rounded font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nueva Receta
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text"
            placeholder="Buscar por producto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none transition-all"
          />
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <select 
            value={filterFamilia}
            onChange={(e) => { setFilterFamilia(e.target.value); setFilterSubfamilia('Todas'); }}
            className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold uppercase tracking-widest text-slate-500 outline-none focus:ring-2 focus:ring-sleek-accent"
          >
            <option value="Todas">Todas las Familias</option>
            {familias.map((f: any) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
          <select 
            value={filterSubfamilia}
            onChange={(e) => setFilterSubfamilia(e.target.value)}
            className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold uppercase tracking-widest text-slate-500 outline-none focus:ring-2 focus:ring-sleek-accent"
          >
            <option value="Todas">Todas las Subfamilias</option>
            {subfamilias.filter((sf: any) => filterFamilia === 'Todas' || sf.familiaId === filterFamilia).map((sf: any) => (
              <option key={sf.id} value={sf.id}>{sf.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Producto Terminado</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Familia / Subfamilia</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cant. Base (kg)</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ingredientes</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Rend. Esperado</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Última Modificación</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredRecetas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center text-slate-300">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="font-bold uppercase tracking-widest">No se encontraron recetas</p>
                  </td>
                </tr>
              ) : (
                filteredRecetas.map((r: any) => {
                  const prod = productos.find((p: any) => p.id === r.productoTerminadoId);
                  const unit = unidades.find((u: any) => u.id === prod?.unidadMedidaId);
                  const fam = familias.find((f: any) => f.id === prod?.familiaId);
                  const sub = subfamilias.find((s: any) => s.id === prod?.subfamiliaId);
                  const modUser = currentUser; // Simplified for demo, should find by ID
                  
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-sleek-dark">{prod?.nombre}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">{prod?.codigo}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-slate-600">{fam?.nombre}</p>
                        <p className="text-[10px] text-slate-400">{sub?.nombre}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-bold">{r.cantidadBase} kg</td>
                      <td className="px-6 py-4 text-sm text-slate-400">{r.insumos.length} ítems</td>
                      <td className="px-6 py-4">
                        <Badge variant="info">{r.rendimientoEsperado}%</Badge>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-slate-600">{safeFormat(r.ultimaModificacion?.fecha, 'dd/MM/yy HH:mm')}</p>
                        <p className="text-[10px] text-slate-400 uppercase font-bold">{modUser?.name}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => { setSelectedRecetaForHistory(r); setIsHistoryModalOpen(true); }} 
                            className="p-2 text-slate-400 hover:text-sleek-accent transition-colors"
                            title="Ver Historial"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleOpenModal(r)} className="p-2 text-slate-400 hover:text-sleek-accent transition-colors">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(r.id)} className="p-2 text-slate-400 hover:text-sleek-danger transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal Receta */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingReceta ? 'Editar Receta' : 'Nueva Receta'}>
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Producto Terminado *</label>
              <select 
                disabled={!!editingReceta}
                value={formData.productoTerminadoId || ''} 
                onChange={e => setFormData({ ...formData, productoTerminadoId: e.target.value })}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent disabled:opacity-50"
              >
                <option value="">Seleccionar Producto</option>
                {productos.filter((p: any) => p.tipo === 'Producto Terminado' && p.origen === 'Producción propia').map((p: any) => (
                  <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>
                ))}
              </select>
              {recetas.some(r => r.productoTerminadoId === formData.productoTerminadoId && (!editingReceta || r.id !== editingReceta.id)) && (
                <p className="text-[10px] text-sleek-danger font-bold mt-1 uppercase">Este producto ya tiene una receta asignada</p>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Cantidad Base (kg)</label>
              <div className="flex flex-col gap-1">
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    value={formData.cantidadBase || 0} 
                    onChange={e => setFormData({ ...formData, cantidadBase: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent"
                  />
                  <span className="flex items-center text-xs font-bold text-slate-400 uppercase">
                    kg
                  </span>
                </div>
                {prodBase && prodBase.unidadMedidaId !== 'u1' && (
                  <p className="text-[9px] font-bold text-sleek-accent uppercase">
                    Equivale a aproximadamente {formatNum(formData.cantidadBase / factorBase, 2)} {unidades.find((u: any) => u.id === prodBase.unidadMedidaId)?.abreviatura || 'un'}
                    {factorBase === 1 && prodBase.unidadMedidaId !== 'u1' && (
                      <span className="text-sleek-danger ml-1">* Sin peso definido</span>
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ingredientes / Materias Primas</h4>
              <button 
                onClick={handleAddInsumo}
                className="text-sleek-accent hover:text-sleek-accent/80 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Agregar Ingrediente
              </button>
            </div>
            
            <div className="border border-slate-100 rounded overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Materia Prima</th>
                    <th className="px-4 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest w-32">Cantidad</th>
                    <th className="px-4 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest w-20">U.M.</th>
                    <th className="px-4 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {formData.insumos.map((ins: any, idx: number) => {
                    const mp = productos.find((p: any) => p.id === ins.materiaPrimaId);
                    const unit = unidades.find((u: any) => u.id === mp?.unidadMedidaId);
                    return (
                      <tr key={idx}>
                        <td className="px-4 py-2">
                          <select 
                            value={ins.materiaPrimaId || ''}
                            onChange={e => handleInsumoChange(idx, 'materiaPrimaId', e.target.value)}
                            className="w-full bg-transparent text-sm focus:outline-none"
                          >
                            <option value="">Seleccionar MP</option>
                            {productos.filter((p: any) => p.tipo === 'Materia Prima' || p.usoCruzado).map((p: any) => (
                              <option key={p.id} value={p.id}>{p.nombre}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input 
                            type="number" 
                            step="0.001"
                            value={ins.cantidad || 0}
                            onChange={e => handleInsumoChange(idx, 'cantidad', parseFloat(e.target.value) || 0)}
                            className="w-full bg-transparent text-sm focus:outline-none font-bold text-sleek-dark"
                          />
                        </td>
                        <td className="px-4 py-2 text-xs font-bold text-slate-400 uppercase">
                          {unit?.abreviatura || '-'}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button onClick={() => handleRemoveInsumo(idx)} className="text-slate-300 hover:text-sleek-danger transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-6 bg-slate-50 p-4 rounded border border-slate-100">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Insumos</p>
                <p className="text-lg font-bold text-sleek-dark">{totalInsumos.toFixed(3)}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Rendimiento Teórico</p>
                <p className={cn(
                  "text-lg font-bold",
                  rendimientoTeorico > 100 ? "text-sleek-danger" : "text-sleek-success"
                )}>{rendimientoTeorico.toFixed(1)}%</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Rendimiento Esperado (%)</label>
              <input 
                type="number" 
                value={formData.rendimientoEsperado || 0} 
                onChange={e => setFormData({ ...formData, rendimientoEsperado: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Observaciones</label>
              <textarea 
                value={formData.observaciones || ''} 
                onChange={e => setFormData({ ...formData, observaciones: e.target.value })}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent h-10"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
            <button onClick={() => setIsModalOpen(false)} className="px-6 py-2 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600">Cancelar</button>
            <button onClick={handleSave} className="px-10 py-2 bg-sleek-dark text-white text-xs font-bold uppercase tracking-widest rounded hover:bg-slate-800 transition-all shadow-lg shadow-sleek-dark/20">Guardar Receta</button>
          </div>
        </div>
      </Modal>

      {/* Modal Historial */}
      <Modal isOpen={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)} title="Historial de Cambios">
        <div className="space-y-6">
          {selectedRecetaForHistory && (
            <div className="bg-slate-50 p-4 rounded border border-slate-100 mb-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Producto</p>
              <p className="text-sm font-bold text-sleek-dark">
                {productos.find((p: any) => p.id === selectedRecetaForHistory.productoTerminadoId)?.nombre}
              </p>
            </div>
          )}
          <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
            {recetasHistorial
              .filter((h: any) => h.recetaId === selectedRecetaForHistory?.id)
              .map((h: any) => (
                <div key={h.id} className="flex gap-4 p-4 bg-white border border-slate-100 rounded-lg shadow-sm">
                  <div className="flex-shrink-0">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      h.accion === 'Creación' ? "bg-sleek-success/10 text-sleek-success" : "bg-sleek-accent/10 text-sleek-accent"
                    )}>
                      {h.accion === 'Creación' ? <Plus className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-xs font-bold text-sleek-dark uppercase tracking-tight">{h.accion}</p>
                      <p className="text-[10px] text-slate-400 font-bold">{safeFormat(h.fecha, 'dd/MM/yyyy HH:mm')}</p>
                    </div>
                    <p className="text-xs text-slate-600 mb-2">{h.detalle}</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Usuario: {currentUser.name}</p>
                  </div>
                </div>
              ))}
            {recetasHistorial.filter((h: any) => h.recetaId === selectedRecetaForHistory?.id).length === 0 && (
              <p className="text-center py-8 text-slate-300 text-xs font-bold uppercase tracking-widest">No hay registros de historial</p>
            )}
          </div>
          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button onClick={() => setIsHistoryModalOpen(false)} className="px-8 py-2 bg-sleek-dark text-white text-xs font-bold uppercase tracking-widest rounded">Cerrar</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

const UnidadesTab = ({ unidades, setUnidades, productos, showNotification }: any) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUnidad, setEditingUnidad] = useState<any>(null);
  const [formData, setFormData] = useState({ abreviatura: '', nombre: '' });

  const handleOpenModal = (unidad = null) => {
    if (unidad) {
      setEditingUnidad(unidad);
      setFormData({ abreviatura: unidad.abreviatura, nombre: unidad.nombre });
    } else {
      setEditingUnidad(null);
      setFormData({ abreviatura: '', nombre: '' });
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!formData.abreviatura || !formData.nombre) {
      showNotification('Todos los campos son obligatorios', 'error');
      return;
    }

    if (editingUnidad) {
      setUnidades(unidades.map((u: any) => u.id === editingUnidad.id ? { ...u, ...formData } : u));
      showNotification('Unidad actualizada con éxito', 'success');
    } else {
      const newUnidad = { id: `u-${Date.now()}`, ...formData };
      setUnidades([...unidades, newUnidad]);
      showNotification('Unidad creada con éxito', 'success');
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    const isUsed = productos.some((p: any) => p.unidadMedidaId === id);
    if (isUsed) {
      showNotification('No se puede eliminar. Hay productos usando esta unidad.', 'error');
      return;
    }
    confirmDialog('¿Estás seguro de eliminar esta unidad de medida?', () => {
      setUnidades(unidades.filter((u: any) => u.id !== id));
      showNotification('Unidad eliminada', 'success');
    });
  };

  return (
    <Card className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h3 className="text-sm font-bold text-sleek-dark uppercase tracking-widest">Gestión de Unidades de Medida</h3>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-sleek-dark text-white px-6 py-2 rounded font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nueva Unidad
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Abreviatura</th>
              <th className="py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nombre Completo</th>
              <th className="py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {unidades.map((u: any) => (
              <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="py-4 text-sm font-bold text-sleek-dark">{u.abreviatura}</td>
                <td className="py-4 text-sm text-slate-600">{u.nombre}</td>
                <td className="py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => handleOpenModal(u)} className="p-2 text-slate-400 hover:text-sleek-accent transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(u.id)} className="p-2 text-slate-400 hover:text-sleek-danger transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingUnidad ? 'Editar Unidad' : 'Nueva Unidad'}>
        <div className="space-y-6">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Abreviatura (ej: kg, lt)</label>
            <input 
              type="text" 
              value={formData.abreviatura || ''}
              onChange={e => setFormData({ ...formData, abreviatura: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Nombre Completo</label>
            <input 
              type="text" 
              value={formData.nombre || ''}
              onChange={e => setFormData({ ...formData, nombre: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent transition-all"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setIsModalOpen(false)} className="px-6 py-2 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600">Cancelar</button>
            <button onClick={handleSave} className="px-8 py-2 bg-sleek-dark text-white text-xs font-bold uppercase tracking-widest rounded hover:bg-slate-800 transition-all">Guardar</button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};

const FamiliasTab = ({ familias, setFamilias, subfamilias, setSubfamilias, productos, showNotification }: any) => {
  const [selectedFamiliaId, setSelectedFamiliaId] = useState<string | null>(null);
  const [isFamModalOpen, setIsFamModalOpen] = useState(false);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [famName, setFamName] = useState('');
  const [subData, setSubData] = useState({ nombre: '', familiaId: '' });

  const handleOpenFamModal = (fam = null) => {
    if (fam) {
      setEditingItem(fam);
      setFamName(fam.nombre);
    } else {
      setEditingItem(null);
      setFamName('');
    }
    setIsFamModalOpen(true);
  };

  const handleOpenSubModal = (sub = null) => {
    if (sub) {
      setEditingItem(sub);
      setSubData({ nombre: sub.nombre, familiaId: sub.familiaId });
    } else {
      setEditingItem(null);
      setSubData({ nombre: '', familiaId: selectedFamiliaId || '' });
    }
    setIsSubModalOpen(true);
  };

  const handleSaveFam = () => {
    if (!famName) return;
    if (editingItem) {
      setFamilias(familias.map((f: any) => f.id === editingItem.id ? { ...f, nombre: famName } : f));
      showNotification('Familia actualizada', 'success');
    } else {
      setFamilias([...familias, { id: `f-${Date.now()}`, nombre: famName }]);
      showNotification('Familia creada', 'success');
    }
    setIsFamModalOpen(false);
  };

  const handleSaveSub = () => {
    if (!subData.nombre || !subData.familiaId) return;
    if (editingItem) {
      setSubfamilias(subfamilias.map((s: any) => s.id === editingItem.id ? { ...s, ...subData } : s));
      showNotification('Subfamilia actualizada', 'success');
    } else {
      setSubfamilias([...subfamilias, { id: `sf-${Date.now()}`, ...subData }]);
      showNotification('Subfamilia creada', 'success');
    }
    setIsSubModalOpen(false);
  };

  const handleDeleteFam = (id: string) => {
    const subsCount = subfamilias.filter((s: any) => s.familiaId === id).length;
    const prodsCount = productos.filter((p: any) => p.familiaId === id).length;
    if (subsCount > 0 || prodsCount > 0) {
      showNotification(`No se puede eliminar. Hay ${subsCount} subfamilias y ${prodsCount} productos asociados.`, 'error');
      return;
    }
    confirmDialog('¿Eliminar familia?', () => {
      setFamilias(familias.filter((f: any) => f.id !== id));
      if (selectedFamiliaId === id) setSelectedFamiliaId(null);
      showNotification('Familia eliminada', 'success');
    });
  };

  const handleDeleteSub = (id: string) => {
    const prodsCount = productos.filter((p: any) => p.subfamiliaId === id).length;
    if (prodsCount > 0) {
      showNotification(`No se puede eliminar. Hay ${prodsCount} productos asociados.`, 'error');
      return;
    }
    confirmDialog('¿Eliminar subfamilia?', () => {
      setSubfamilias(subfamilias.filter((s: any) => s.id !== id));
      showNotification('Subfamilia eliminada', 'success');
    });
  };

  const filteredSubs = selectedFamiliaId 
    ? subfamilias.filter((s: any) => s.familiaId === selectedFamiliaId)
    : subfamilias;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Familias */}
      <Card className="p-8">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-sm font-bold text-sleek-dark uppercase tracking-widest">Familias</h3>
          <button onClick={() => handleOpenFamModal()} className="bg-sleek-dark text-white px-4 py-2 rounded font-bold text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2">
            <Plus className="w-3 h-3" /> Nueva Familia
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nombre</th>
                <th className="py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Subs</th>
                <th className="py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {familias.map((f: any) => (
                <tr 
                  key={f.id} 
                  onClick={() => setSelectedFamiliaId(selectedFamiliaId === f.id ? null : f.id)}
                  className={cn(
                    "cursor-pointer transition-colors",
                    selectedFamiliaId === f.id ? "bg-sleek-accent/5" : "hover:bg-slate-50/50"
                  )}
                >
                  <td className="py-4 text-sm font-bold text-sleek-dark">{f.nombre}</td>
                  <td className="py-4 text-sm text-slate-400">{subfamilias.filter((s: any) => s.familiaId === f.id).length}</td>
                  <td className="py-4 text-right">
                    <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleOpenFamModal(f)} className="p-2 text-slate-400 hover:text-sleek-accent"><Edit2 className="w-3 h-3" /></button>
                      <button onClick={() => handleDeleteFam(f.id)} className="p-2 text-slate-400 hover:text-sleek-danger"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Subfamilias */}
      <Card className="p-8">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-sleek-dark uppercase tracking-widest">Subfamilias</h3>
            {selectedFamiliaId && (
              <Badge variant="info">
                {familias.find((f: any) => f.id === selectedFamiliaId)?.nombre}
                <button onClick={() => setSelectedFamiliaId(null)} className="ml-2 hover:text-sleek-danger">×</button>
              </Badge>
            )}
          </div>
          <button onClick={() => handleOpenSubModal()} className="bg-sleek-dark text-white px-4 py-2 rounded font-bold text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2">
            <Plus className="w-3 h-3" /> Nueva Subfamilia
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nombre</th>
                <th className="py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Familia</th>
                <th className="py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredSubs.map((s: any) => (
                <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 text-sm font-bold text-sleek-dark">{s.nombre}</td>
                  <td className="py-4 text-sm text-slate-400">{familias.find((f: any) => f.id === s.familiaId)?.nombre}</td>
                  <td className="py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => handleOpenSubModal(s)} className="p-2 text-slate-400 hover:text-sleek-accent"><Edit2 className="w-3 h-3" /></button>
                      <button onClick={() => handleDeleteSub(s.id)} className="p-2 text-slate-400 hover:text-sleek-danger"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modals */}
      <Modal isOpen={isFamModalOpen} onClose={() => setIsFamModalOpen(false)} title={editingItem ? 'Editar Familia' : 'Nueva Familia'}>
        <div className="space-y-6">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Nombre de la Familia</label>
            <input type="text" value={famName || ''} onChange={e => setFamName(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent transition-all" />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setIsFamModalOpen(false)} className="px-6 py-2 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600">Cancelar</button>
            <button onClick={handleSaveFam} className="px-8 py-2 bg-sleek-dark text-white text-xs font-bold uppercase tracking-widest rounded hover:bg-slate-800 transition-all">Guardar</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isSubModalOpen} onClose={() => setIsSubModalOpen(false)} title={editingItem ? 'Editar Subfamilia' : 'Nueva Subfamilia'}>
        <div className="space-y-6">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Nombre de la Subfamilia</label>
            <input type="text" value={subData.nombre || ''} onChange={e => setSubData({ ...subData, nombre: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent transition-all" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Familia Perteneciente</label>
            <select value={subData.familiaId || ''} onChange={e => setSubData({ ...subData, familiaId: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent transition-all">
              <option value="">Seleccionar Familia</option>
              {familias.map((f: any) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setIsSubModalOpen(false)} className="px-6 py-2 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600">Cancelar</button>
            <button onClick={handleSaveSub} className="px-8 py-2 bg-sleek-dark text-white text-xs font-bold uppercase tracking-widest rounded hover:bg-slate-800 transition-all">Guardar</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

const LoginView = ({ onLogin }: { 
  onLogin: (u: string, p: string) => void 
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(username, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-sleek-bg p-4">
      <div className="bg-white p-10 rounded-lg shadow-xl w-full max-w-md border border-slate-200">
        <div className="text-center mb-8">
          <img id="logo-alido" src="/alido-logo.png" alt="Alido Logo" className="h-24 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-sleek-dark uppercase tracking-widest">Alido - Gestión</h1>
          <p className="text-slate-400 text-sm mt-2">Inicie sesión para continuar</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2 tracking-wider">Usuario</label>
            <input 
              type="text" 
              className="w-full px-4 py-3 border border-slate-200 rounded focus:ring-2 focus:ring-sleek-accent focus:border-transparent outline-none transition-all"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2 tracking-wider">Contraseña</label>
            <input 
              type="password" 
              className="w-full px-4 py-3 border border-slate-200 rounded focus:ring-2 focus:ring-sleek-accent focus:border-transparent outline-none transition-all"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <button 
            type="submit" 
            className="w-full bg-sleek-dark hover:bg-slate-800 text-white font-bold py-4 rounded transition-all uppercase tracking-widest text-sm"
          >
            Ingresar
          </button>
        </form>
        <div className="mt-6 text-center">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Credenciales de Acceso:</p>
          <p className="text-[10px] text-slate-500 mt-1">Admin: GuidoM / Alido</p>
        </div>
        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3">Desarrollado por</p>
          <img src="/basal-logo.png" alt="Basal Logo" className="h-8 mx-auto hover:scale-110 transition-all" />
        </div>
      </div>
    </div>
  );
};

const PlantillasDespieceView = ({ 
  plantillasDespiece, setPlantillasDespiece, 
  plantillasDespieceHistorial, setPlantillasDespieceHistorial,
  productos, unidades, users,
  currentUser, showNotification, getPesoEquivalente
}: any) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [editingPlantilla, setEditingPlantilla] = useState<any>(null);
  const [selectedPlantillaForHistory, setSelectedPlantillaForHistory] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState<any>({
    materiaPrimaId: '',
    cortes: [],
    observaciones: ''
  });

  const handleOpenModal = (plantilla = null) => {
    if (plantilla) {
      setEditingPlantilla(plantilla);
      setFormData({ ...plantilla });
    } else {
      setEditingPlantilla(null);
      setFormData({
        materiaPrimaId: '',
        cortes: [],
        observaciones: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleAddCorte = () => {
    setFormData({
      ...formData,
      cortes: [...formData.cortes, { productoId: '', rendimientoEsperado: 0 }]
    });
  };

  const handleRemoveCorte = (index: number) => {
    setFormData({
      ...formData,
      cortes: formData.cortes.filter((_: any, i: number) => i !== index)
    });
  };

  const handleCorteChange = (index: number, field: string, value: any) => {
    const newCortes = [...formData.cortes];
    newCortes[index] = { ...newCortes[index], [field]: value };
    setFormData({ ...formData, cortes: newCortes });
  };

  const rendimientoTotal = formData.cortes.reduce((sum: number, c: any) => sum + (parseFloat(c.rendimientoEsperado) || 0), 0);
  const mermaEsperada = Math.max(0, 100 - rendimientoTotal);

  const handleSave = () => {
    if (!formData.materiaPrimaId || formData.cortes.length === 0) {
      showNotification('Complete la materia prima y al menos un corte', 'error');
      return;
    }

    if (rendimientoTotal > 100) {
      showNotification('El rendimiento total no puede superar el 100%', 'error');
      return;
    }

    const alreadyHasPlantilla = plantillasDespiece.some((p: any) => p.materiaPrimaId === formData.materiaPrimaId && (!editingPlantilla || p.id !== editingPlantilla.id));
    if (alreadyHasPlantilla) {
      showNotification('Esta materia prima ya tiene una plantilla asignada', 'error');
      return;
    }

    const now = new Date().toISOString();
    const detail = editingPlantilla 
      ? `Modificación de plantilla: ${productos.find((p: any) => p.id === formData.materiaPrimaId)?.nombre}`
      : `Creación de plantilla: ${productos.find((p: any) => p.id === formData.materiaPrimaId)?.nombre}`;

    if (editingPlantilla) {
      const updatedPlantilla = { 
        ...editingPlantilla, 
        ...formData, 
        ultimaModificacion: { fecha: now, usuarioId: currentUser.id } 
      };
      setPlantillasDespiece(plantillasDespiece.map((p: any) => p.id === editingPlantilla.id ? updatedPlantilla : p));
      
      const historyEntry: PlantillaDespieceHistorial = {
        id: `pdh-${Date.now()}`,
        plantillaId: editingPlantilla.id,
        fecha: now,
        usuarioId: currentUser.id,
        accion: 'Modificación',
        detalle: detail
      };
      setPlantillasDespieceHistorial([historyEntry, ...plantillasDespieceHistorial]);
      showNotification('Plantilla actualizada', 'success');
    } else {
      const newId = `pd-${Date.now()}`;
      const newPlantilla = { 
        ...formData, 
        id: newId,
        creadoPor: currentUser.id,
        fechaCreacion: now,
        ultimaModificacion: { fecha: now, usuarioId: currentUser.id }
      };
      setPlantillasDespiece([...plantillasDespiece, newPlantilla]);

      const historyEntry: PlantillaDespieceHistorial = {
        id: `pdh-${Date.now()}`,
        plantillaId: newId,
        fecha: now,
        usuarioId: currentUser.id,
        accion: 'Creación',
        detalle: detail
      };
      setPlantillasDespieceHistorial([historyEntry, ...plantillasDespieceHistorial]);
      showNotification('Plantilla creada', 'success');
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    confirmDialog('¿Eliminar esta plantilla? No afectará a los lotes ya creados.', () => {
      setPlantillasDespiece(plantillasDespiece.filter((p: any) => p.id !== id));
      showNotification('Plantilla eliminada', 'success');
    });
  };

  const filteredPlantillas = plantillasDespiece.filter((p: any) => {
    const prod = productos.find((pr: any) => pr.id === p.materiaPrimaId);
    return prod?.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
           prod?.codigo.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-sleek-dark uppercase tracking-widest">Plantillas de Despiece</h2>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-sleek-dark text-white px-6 py-2 rounded font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nueva Plantilla
        </button>
      </div>

      <div className="flex gap-4 items-center bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text"
            placeholder="Buscar por materia prima..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none transition-all"
          />
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Materia Prima</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Cortes</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Rendimiento Total</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Última Modificación</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredPlantillas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center text-slate-300">
                    <Layers className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="font-bold uppercase tracking-widest">No hay plantillas registradas</p>
                  </td>
                </tr>
              ) : (
                filteredPlantillas.map((p: any) => {
                  const prod = productos.find((pr: any) => pr.id === p.materiaPrimaId);
                  const rendTotal = p.cortes.reduce((sum: number, c: any) => sum + c.rendimientoEsperado, 0);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-sleek-dark">{prod?.nombre}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">{prod?.codigo}</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge variant="default">{p.cortes.length} cortes</Badge>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-sm font-bold text-sleek-dark">{rendTotal.toFixed(1)}%</span>
                          <div className="w-20 h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full transition-all",
                                rendTotal >= 90 ? "bg-sleek-success" : rendTotal >= 70 ? "bg-sleek-accent" : "bg-sleek-warning"
                              )}
                              style={{ width: `${rendTotal}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-slate-600">{safeFormat(p.ultimaModificacion?.fecha, 'dd/MM/yy HH:mm')}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => { setSelectedPlantillaForHistory(p); setIsHistoryModalOpen(true); }} 
                            className="p-2 text-slate-400 hover:text-sleek-accent transition-colors"
                            title="Ver Historial"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleOpenModal(p)} className="p-2 text-slate-400 hover:text-sleek-accent transition-colors">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(p.id)} className="p-2 text-slate-400 hover:text-sleek-danger transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal Plantilla */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingPlantilla ? 'Editar Plantilla' : 'Nueva Plantilla'}>
        <div className="space-y-8">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Materia Prima de Origen *</label>
            <select 
              disabled={!!editingPlantilla}
              value={formData.materiaPrimaId || ''} 
              onChange={e => setFormData({ ...formData, materiaPrimaId: e.target.value })}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent disabled:opacity-50"
            >
              <option value="">Seleccionar Materia Prima</option>
              {productos.filter((p: any) => p.tipo === 'Materia Prima').map((p: any) => (
                <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>
              ))}
            </select>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cortes Obtenidos</h4>
              <button 
                onClick={handleAddCorte}
                className="text-sleek-accent hover:text-sleek-accent/80 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Agregar Corte
              </button>
            </div>
            
            <div className="border border-slate-100 rounded overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Producto (Corte)</th>
                    <th className="px-4 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest w-32">Rendimiento (%)</th>
                    <th className="px-4 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {formData.cortes.map((c: any, idx: number) => (
                    <tr key={idx}>
                      <td className="px-4 py-2">
                        <select 
                          value={c.productoId || ''}
                          onChange={e => handleCorteChange(idx, 'productoId', e.target.value)}
                          className="w-full bg-transparent text-sm focus:outline-none"
                        >
                          <option value="">Seleccionar Producto</option>
                          {productos.filter((p: any) => (p.tipo === 'Producto Terminado' && p.origen === 'Despiece') || p.usoCruzado).map((p: any) => (
                            <option key={p.id} value={p.id}>{p.nombre}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input 
                          type="number" 
                          step="0.1"
                          value={c.rendimientoEsperado || 0}
                          onChange={e => handleCorteChange(idx, 'rendimientoEsperado', parseFloat(e.target.value) || 0)}
                          className="w-full bg-transparent text-sm focus:outline-none font-mono"
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => handleRemoveCorte(idx)} className="text-slate-300 hover:text-sleek-danger transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {formData.cortes.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-slate-300 italic text-xs">
                        No hay cortes definidos
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-slate-50/50 font-bold">
                  <tr>
                    <td className="px-4 py-3 text-[9px] uppercase tracking-widest text-slate-400">Rendimiento Total</td>
                    <td className="px-4 py-3 text-sm text-sleek-dark font-mono">{rendimientoTotal.toFixed(1)}%</td>
                    <td></td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-[9px] uppercase tracking-widest text-slate-400">Merma Esperada</td>
                    <td className="px-4 py-3 text-sm text-sleek-warning font-mono">{mermaEsperada.toFixed(1)}%</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="md:col-span-2 flex justify-end gap-3 pt-6 border-t border-slate-100">
            <button onClick={() => setIsModalOpen(false)} className="px-6 py-2 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600">Cancelar</button>
            <button onClick={handleSave} className="px-10 py-2 bg-sleek-dark text-white text-xs font-bold uppercase tracking-widest rounded hover:bg-slate-800 transition-all shadow-lg shadow-sleek-dark/20">Guardar Plantilla</button>
          </div>
        </div>
      </Modal>

      {/* Modal Historial */}
      <Modal isOpen={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)} title="Historial de Cambios">
        <div className="space-y-6 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-px before:bg-slate-100">
          {plantillasDespieceHistorial
            .filter((h: any) => h.plantillaId === selectedPlantillaForHistory?.id)
            .map((h: any) => {
              const user = users.find((u: any) => u.id === h.usuarioId);
              return (
                <div key={h.id} className="relative pl-10">
                  <div className="absolute left-2.5 top-1.5 w-3 h-3 rounded-full bg-white border-2 border-sleek-accent"></div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">{safeFormat(h.fecha, 'dd/MM/yy HH:mm')}</p>
                  <p className="text-xs font-bold text-sleek-dark mb-1">{h.accion} por {user?.name}</p>
                  <p className="text-xs text-slate-500">{h.detalle}</p>
                </div>
              );
            })}
        </div>
      </Modal>
    </div>
  );
};

const LotesProduccionView = ({ 
  lotesProduccion, setLotesProduccion, 
  lotesHistorial, setLotesHistorial,
  recetas, productos, almacenes, 
  lotesStock,
  movimientos, setMovimientos,
  unidades, users, currentUser, showNotification, getPesoEquivalente,
  lotesEtiquetados, setLotesEtiquetados, setDescuentosPendientes
}: any) => {
  const [view, setView] = useState<'list' | 'form' | 'detail'>('list');
  const [selectedLote, setSelectedLote] = useState<any>(null);
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState('Todos');
  const [isFinalizing, setIsFinalizing] = useState(false);

  const [formData, setFormData] = useState<any>({
    numeroLote: '',
    productoId: '',
    cantidadEstimada: 0,
    fechaElaboracion: safeFormat(new Date(), 'yyyy-MM-dd'),
    fechaVencimiento: '',
    responsableId: currentUser.id,
    observaciones: '',
    insumos: []
  });

  const [finalizeData, setFinalizeData] = useState({
    pesoBruto: 0,
    pesoNeto: 0,
    unidadesReales: 0,
    almacenDestinoId: ''
  });

  const handleNewLote = () => {
    const nextNum = lotesProduccion.length > 0 ? Math.max(...lotesProduccion.map((l: any) => parseInt(l.numeroLote.split('-')[1]) || 0)) + 1 : 1;
    setFormData({
      numeroLote: `L-${nextNum.toString().padStart(4, '0')}`,
      productoId: '',
      cantidadEstimada: 0,
      fechaElaboracion: safeFormat(new Date(), 'yyyy-MM-dd'),
      fechaVencimiento: '',
      responsableId: currentUser.id,
      observaciones: '',
      insumos: []
    });
    setSelectedLote(null);
    setView('form');
  };

  const handleEditLote = (lote: any) => {
    if (lote.estado === 'Cerrado') {
      showNotification('No se pueden editar lotes cerrados', 'error');
      return;
    }
    setFormData({ ...lote });
    setSelectedLote(lote);
    setView('form');
  };

  const handleProductoChange = (prodId: string) => {
    const receta = recetas.find((r: any) => r.productoTerminadoId === prodId);
    const prod = productos.find((p: any) => p.id === prodId);
    
    let insumos = [];
    if (receta) {
      insumos = receta.insumos.map((ins: any) => ({
        ...ins,
        cantidadTeorica: (ins.cantidad / receta.cantidadBase) * formData.cantidadEstimada,
        cantidadReal: (ins.cantidad / receta.cantidadBase) * formData.cantidadEstimada
      }));
    }

    setFormData({
      ...formData,
      productoId: prodId,
      insumos,
      fechaVencimiento: prod?.vidaUtilDias ? safeFormat(addDays(parseISO(formData.fechaElaboracion), prod.vidaUtilDias), 'yyyy-MM-dd', '') : ''
    });
  };

  const handleCantidadEstimadaChange = (val: number) => {
    const receta = recetas.find((r: any) => r.productoTerminadoId === formData.productoId);
    const newInsumos = formData.insumos.map((ins: any) => ({
      ...ins,
      cantidadTeorica: receta ? (ins.cantidad / receta.cantidadBase) * val : 0,
      cantidadReal: receta ? (ins.cantidad / receta.cantidadBase) * val : 0
    }));
    setFormData({ ...formData, cantidadEstimada: val, insumos: newInsumos });
  };

  const handleSaveLote = (estado: 'Planificado' | 'En Proceso' | 'Finalizado') => {
    if (!formData.productoId || formData.cantidadEstimada <= 0) {
      showNotification('Complete los campos obligatorios', 'error');
      return;
    }

    const now = new Date().toISOString();
    const detail = selectedLote ? `Edición de lote ${formData.numeroLote}` : `Creación de lote ${formData.numeroLote}`;

    if (selectedLote) {
      const leProd = lotesEtiquetados.find((item: any) => item.loteId === selectedLote.id || item.loteId === selectedLote.numeroLote);
      const activeEnv = (leProd?.envases || []).filter((e: any) => !(e.anulado === true || e.anulado === 'true' || e.estado === 'baja'));
      const pesoDesdeEtiquetas = activeEnv.reduce((s: number, e: any) => s + (parseFloat(e.pesoNeto) || 0), 0);
      const prodPT = productos.find((p: any) => p.id === formData.productoId);
      const usesUnitsPT = prodPT?.unidadMedidaId !== 'u1';
      const mergedForm = estado === 'Finalizado' && activeEnv.length > 0
        ? {
            ...formData,
            pesoNeto: pesoDesdeEtiquetas,
            unidadesReales: usesUnitsPT ? activeEnv.length : formData.unidadesReales
          }
        : formData;

      const updatedLote = { ...mergedForm, estado: estado === 'Finalizado' ? 'Finalizado' : estado };

      if (estado === 'Finalizado') {
        const oldAlm = selectedLote.almacenDestinoId;
        const newAlm = mergedForm.almacenDestinoId;
        if (oldAlm && newAlm && oldAlm !== newAlm) {
          const cantidadMove = usesUnitsPT ? (updatedLote.unidadesReales || 0) : (parseFloat(updatedLote.pesoNeto) || 0);
          const cantidadKg = parseFloat(updatedLote.pesoNeto) || 0;
          if (cantidadMove > 0) {
            const unitPT = unidades.find((u: any) => u.id === prodPT?.unidadMedidaId)?.abreviatura || 'kg';
            const nombreViejo = almacenes.find((a: any) => a.id === oldAlm)?.nombre || String(oldAlm);
            const nombreNuevo = almacenes.find((a: any) => a.id === newAlm)?.nombre || String(newAlm);
            const motivo = `Transferencia: ${nombreViejo} → ${nombreNuevo} (Lote ${formData.numeroLote})`;
            const base = {
              productoId: formData.productoId,
              cantidad: cantidadMove,
              unidad: unitPT,
              cantidadKg,
              motivo,
              loteNumero: formData.numeroLote,
              fechaIngreso: safeFormat(new Date(), 'yyyy-MM-dd'),
              fechaVencimiento: formData.fechaVencimiento,
              origen: 'transferencia' as const,
              usuario: currentUser.name,
              fechaHora: now,
              anulado: false,
              referencia: formData.numeroLote,
              observaciones: ''
            };
            setMovimientos([
              { ...base, id: `MOV-${Date.now()}-${Math.random()}`, tipo: 'salida' as const, almacenId: oldAlm },
              { ...base, id: `MOV-${Date.now()}-${Math.random()}`, tipo: 'entrada' as const, almacenId: newAlm },
              ...movimientos
            ]);
          }
        }
      }

      setLotesProduccion(lotesProduccion.map((l: any) => l.id === selectedLote.id ? updatedLote : l));
      
      const historyEntry: LoteProduccionHistorial = {
        id: `lh-${Date.now()}`,
        loteId: selectedLote.id,
        fecha: now,
        usuarioId: currentUser.id,
        accion: 'Modificación',
        detalle: detail
      };
      setLotesHistorial([historyEntry, ...lotesHistorial]);
    } else {
      const newId = `lp-${Date.now()}`;
      const newLote = { ...formData, id: newId, estado };
      setLotesProduccion([...lotesProduccion, newLote]);

      const historyEntry: LoteProduccionHistorial = {
        id: `lh-${Date.now()}`,
        loteId: newId,
        fecha: now,
        usuarioId: currentUser.id,
        accion: 'Creación',
        detalle: detail
      };
      setLotesHistorial([historyEntry, ...lotesHistorial]);
    }

    const saveMsg = estado === 'Planificado' ? 'planificado' : estado === 'Finalizado' ? 'guardado' : 'iniciado';
    showNotification(`Lote ${saveMsg} correctamente`, 'success');
    setView(estado === 'Finalizado' && selectedLote ? 'detail' : 'list');
  };

  const handleFinalize = () => {
    if (isFinalizing) return;
    if (selectedLote?.estado === 'Finalizado') {
      showNotification('Este lote ya fue finalizado.', 'error');
      setIsFinalizeModalOpen(false);
      return;
    }

    if (finalizeData.pesoNeto <= 0 || !finalizeData.almacenDestinoId) {
      showNotification('Complete los datos de finalización', 'error');
      return;
    }

    setIsFinalizing(true);

    const now = new Date().toISOString();
    
    // Check stock of all ingredients
    const insufficientStockMP = selectedLote.insumos.filter((ins: any) => {
      const stock = lotesStock.filter((ls: any) => ls.productoId === ins.materiaPrimaId).reduce((sum: number, ls: any) => sum + ls.cantidad, 0);
      return stock < ins.cantidadReal;
    });

    if (insufficientStockMP.length > 0) {
      const newPending = insufficientStockMP.map((ins: any) => {
        const stock = lotesStock.filter((ls: any) => ls.productoId === ins.materiaPrimaId).reduce((sum: number, ls: any) => sum + ls.cantidad, 0);
        return {
          id: `dp-${Date.now()}-${Math.random()}`,
          loteId: selectedLote.id,
          loteNumero: selectedLote.numeroLote,
          productoId: ins.materiaPrimaId,
          cantidadSolicitada: ins.cantidadReal,
          cantidadDisponible: stock,
          pendiente: ins.cantidadReal - stock,
          fecha: now
        };
      });
      setDescuentosPendientes((prev: any) => [...prev, ...newPending]);
      showNotification('Aviso: Stock insuficiente para algunos insumos. Se registró el descuento pendiente.', 'error');
    }

    const totalRealKg = selectedLote.insumos.reduce((sum: number, ins: any) => sum + (ins.cantidadReal * getPesoEquivalente(ins.materiaPrimaId)), 0);
    const rendimientoReal = (finalizeData.pesoNeto / totalRealKg) * 100;
    const mermaKg = totalRealKg - finalizeData.pesoNeto;
    const mermaPorcentaje = (mermaKg / totalRealKg) * 100;
    
    const receta = recetas.find((r: any) => r.productoTerminadoId === selectedLote.productoId);
    const desvioRendimiento = rendimientoReal - (receta?.rendimientoEsperado || 100);

    // Anular movimientos previos si existen para este lote (para evitar duplicados al re-finalizar tras editar)
    const updatedMovimientos = movimientos.map((m: any) => {
      const isAlreadyAnulado = m.anulado === true || m.anulado === 'true' || m.estado === 'anulado';
      if (m.referencia === selectedLote.numeroLote && !isAlreadyAnulado) {
        return { ...m, anulado: true };
      }
      return m;
    });

    // Update movements
    const addedMovimientos: any[] = [];
    const prod = productos.find((p: any) => p.id === selectedLote.productoId);
    const unidadPT = unidades.find((u: any) => u.id === prod?.unidadMedidaId)?.abreviatura || 'kg';

    selectedLote.insumos.forEach((ins: any) => {
      let remainingToDeduct = ins.cantidadReal;
      const productLotes = [...lotesStock]
        .filter((ls: any) => ls.productoId === ins.materiaPrimaId)
        .sort((a, b) => new Date(a.fechaVencimiento).getTime() - new Date(b.fechaVencimiento).getTime());

      productLotes.forEach((ls: any) => {
        if (remainingToDeduct <= 0) return;
        const deduct = Math.min(ls.cantidad, remainingToDeduct);
        remainingToDeduct -= deduct;

        const prodIns = productos.find((p: any) => p.id === ins.materiaPrimaId);
        const unitIns = unidades.find((u: any) => u.id === prodIns?.unidadMedidaId)?.abreviatura || 'kg';

        addedMovimientos.push({
          id: `MOV-${Date.now()}-${Math.random()}`,
          tipo: 'salida',
          productoId: ins.materiaPrimaId,
          almacenId: ls.almacenId,
          cantidad: deduct,
          unidad: unitIns,
          cantidadKg: deduct * getPesoEquivalente(ins.materiaPrimaId),
          motivo: `Consumo Producción Lote ${selectedLote.numeroLote}`,
          loteNumero: ls.numeroLote,
          fechaIngreso: safeFormat(new Date(), 'yyyy-MM-dd'),
          fechaVencimiento: ls.fechaVencimiento,
          origen: 'produccion',
          usuario: currentUser.name,
          fechaHora: now,
          anulado: false,
          referencia: selectedLote.numeroLote
        });
      });
    });

    // Add finished product movement
    addedMovimientos.push({
      id: `MOV-${Date.now()}-pt`,
      tipo: 'entrada',
      productoId: selectedLote.productoId,
      almacenId: finalizeData.almacenDestinoId,
      cantidad: prod?.unidadMedidaId !== 'u1' ? finalizeData.unidadesReales : finalizeData.pesoNeto,
      unidad: unidadPT,
      cantidadKg: finalizeData.pesoNeto,
      motivo: `Producción Finalizada Lote ${selectedLote.numeroLote}`,
      loteNumero: selectedLote.numeroLote,
      fechaIngreso: safeFormat(new Date(), 'yyyy-MM-dd'),
      fechaVencimiento: selectedLote.fechaVencimiento,
      origen: 'produccion',
      usuario: currentUser.name,
      fechaHora: now,
      anulado: false,
      referencia: selectedLote.numeroLote
    });

    // Update Lote
    const finalizedLote = {
      ...selectedLote,
      ...finalizeData,
      estado: 'Finalizado',
      fechaFinalizacion: now,
      rendimientoReal,
      mermaKg,
      mermaPorcentaje,
      desvioRendimiento
    };

    setLotesProduccion(lotesProduccion.map((l: any) => l.id === selectedLote.id ? finalizedLote : l));
    setMovimientos([...addedMovimientos, ...updatedMovimientos]);
    
    // Update Etiquetas state if exists
    const etiquetaData = lotesEtiquetados.find((le: any) => le.loteId === selectedLote.id);
    if (etiquetaData && etiquetaData.estado !== 'finalizado') {
       setLotesEtiquetados(lotesEtiquetados.map((le: any) => 
         le.loteId === selectedLote.id ? { ...le, estado: 'finalizado' } : le
       ));
    }

    const historyEntry: LoteProduccionHistorial = {
      id: `lh-${Date.now()}`,
      loteId: selectedLote.id,
      fecha: now,
      usuarioId: currentUser.id,
      accion: 'Finalización',
      detalle: `Lote finalizado. Rendimiento: ${rendimientoReal.toFixed(1)}%, Merma: ${mermaKg.toFixed(2)}kg`
    };
    setLotesHistorial([historyEntry, ...lotesHistorial]);

    setIsFinalizeModalOpen(false);
    setIsFinalizing(false);
    setSelectedLote(finalizedLote);
    setView('detail');
    showNotification('Lote finalizado correctamente', 'success');
  };

  const filteredLotes = lotesProduccion.filter((l: any) => {
    const prod = productos.find((p: any) => p.id === l.productoId);
    const matchesSearch = l.numeroLote.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         prod?.nombre.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEstado = filterEstado === 'Todos' || l.estado === filterEstado;
    return matchesSearch && matchesEstado;
  }).sort((a: any, b: any) => new Date(b.fechaElaboracion).getTime() - new Date(a.fechaElaboracion).getTime());

  if (view === 'form') {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center gap-4">
          <button onClick={() => setView('list')} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </button>
          <h2 className="text-2xl font-bold text-sleek-dark uppercase tracking-widest">
            {selectedLote ? 'Editar Lote' : 'Nuevo Lote de Producción'}
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card className="p-8">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Datos Generales
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Número de Lote *</label>
                  <input 
                    type="text" 
                    value={formData.numeroLote || ''} 
                    onChange={e => setFormData({ ...formData, numeroLote: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Producto a Elaborar *</label>
                  <select 
                    value={formData.productoId || ''} 
                    onChange={e => handleProductoChange(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent"
                  >
                    <option value="">Seleccionar Producto</option>
                    {productos.filter((p: any) => p.tipo === 'Producto Terminado' && p.origen === 'Producción propia').map((p: any) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Cantidad Estimada (kg) *</label>
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-2">
                      <input 
                        type="number" 
                        value={formData.cantidadEstimada || 0} 
                        onChange={e => handleCantidadEstimadaChange(parseFloat(e.target.value) || 0)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent"
                      />
                      <span className="flex items-center text-xs font-bold text-slate-400 uppercase">
                        kg
                      </span>
                    </div>
                    {formData.productoId && productos.find((p: any) => p.id === formData.productoId)?.unidadMedidaId !== 'u1' && (
                      <p className="text-[9px] font-bold text-sleek-accent uppercase">
                        Equivale a aproximadamente {formatNum(formData.cantidadEstimada / getPesoEquivalente(formData.productoId))} {unidades.find((u: any) => u.id === productos.find((p: any) => p.id === formData.productoId)?.unidadMedidaId)?.abreviatura || 'un'}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Responsable *</label>
                  <select 
                    value={formData.responsableId || ''} 
                    onChange={e => setFormData({ ...formData, responsableId: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent"
                  >
                    {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Fecha Elaboración</label>
                  <input 
                    type="date" 
                    value={formData.fechaElaboracion || ''} 
                    onChange={e => setFormData({ ...formData, fechaElaboracion: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Fecha Vencimiento</label>
                  <input 
                    type="date" 
                    value={formData.fechaVencimiento || ''} 
                    onChange={e => setFormData({ ...formData, fechaVencimiento: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent"
                  />
                </div>
              </div>
            </Card>

            <Card className="p-0 overflow-hidden">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Layers className="w-4 h-4" /> Materias Primas / Insumos
                </h3>
                {!recetas.some(r => r.productoTerminadoId === formData.productoId) && formData.productoId && (
                  <p className="text-[10px] text-sleek-danger font-bold uppercase tracking-widest animate-pulse">Este producto no tiene receta estándar</p>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50">
                    <tr>
                      <th className="px-8 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Insumo</th>
                      <th className="px-8 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Teórico</th>
                      <th className="px-8 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Real Usado</th>
                      <th className="px-8 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">U.M.</th>
                      <th className="px-8 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Stock Disp.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {formData.insumos.map((ins: any, idx: number) => {
                      const mp = productos.find((p: any) => p.id === ins.materiaPrimaId);
                      const unit = unidades.find((u: any) => u.id === mp?.unidadMedidaId);
                      const stock = lotesStock.filter((ls: any) => ls.productoId === ins.materiaPrimaId).reduce((sum: number, ls: any) => sum + ls.cantidad, 0);
                      
                      return (
                        <tr key={idx}>
                          <td className="px-8 py-4">
                            <p className="text-sm font-bold text-sleek-dark">{mp?.nombre}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-bold">{mp?.codigo}</p>
                          </td>
                          <td className="px-8 py-4 text-sm text-slate-400 font-mono">{formatNum(ins.cantidadTeorica)}</td>
                          <td className="px-8 py-4">
                            <input 
                              type="number" 
                              step="0.001"
                              value={ins.cantidadReal || 0}
                              disabled={selectedLote?.estado === 'Finalizado'}
                              onChange={e => {
                                const newInsumos = [...formData.insumos];
                                newInsumos[idx].cantidadReal = formatNum(parseFloat(e.target.value) || 0);
                                setFormData({ ...formData, insumos: newInsumos });
                              }}
                              className="w-24 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-sm font-bold focus:outline-none focus:border-sleek-accent disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-8 py-4 text-xs font-bold text-slate-400 uppercase">{unit?.abreviatura}</td>
                          <td className="px-8 py-4">
                            <span className={cn(
                              "text-xs font-bold px-2 py-1 rounded",
                              stock < ins.cantidadReal ? "bg-sleek-danger/10 text-sleek-danger" : "bg-sleek-success/10 text-sleek-success"
                            )}>
                              {formatNum(stock, 2)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {formData.insumos.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-8 py-12 text-center text-slate-300 italic text-sm">
                          Seleccione un producto con receta para cargar insumos automáticamente
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-6 bg-sleek-dark text-white">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Resumen de Insumos</h4>
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <p className="text-xs text-slate-400 font-bold uppercase">Total Teórico</p>
                  <p className="text-xl font-bold">{displayNum(formData.insumos.reduce((sum: number, ins: any) => sum + ins.cantidadTeorica, 0), 2)} kg</p>
                </div>
                <div className="flex justify-between items-end">
                  <p className="text-xs text-slate-400 font-bold uppercase">Total Real</p>
                  <p className="text-xl font-bold">{displayNum(formData.insumos.reduce((sum: number, ins: any) => sum + ins.cantidadReal, 0), 2)} kg</p>
                </div>
                <div className="pt-4 border-t border-white/10">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-2">Observaciones</p>
                  <textarea 
                    value={formData.observaciones || ''}
                    onChange={e => setFormData({ ...formData, observaciones: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm focus:outline-none focus:border-white/20 h-24 resize-none"
                    placeholder="Notas adicionales..."
                  />
                </div>
              </div>
            </Card>

            <div className="flex flex-col gap-3">
              {selectedLote?.estado === 'Finalizado' ? (
                <>
                  <div className="p-4 bg-sleek-success/10 border border-sleek-success/20 rounded-xl text-center">
                    <p className="text-[10px] font-black text-sleek-success uppercase tracking-widest">Lote finalizado</p>
                    <p className="text-[9px] text-slate-500 font-bold mt-2 uppercase">Peso neto y unidades provienen de la estación de Etiquetas</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Almacén de destino</label>
                    <select
                      value={formData.almacenDestinoId || ''}
                      onChange={e => setFormData({ ...formData, almacenDestinoId: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold focus:outline-none focus:border-sleek-accent"
                    >
                      <option value="">Seleccionar…</option>
                      {almacenes.map((a: any) => (
                        <option key={a.id} value={a.id}>{a.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <button 
                    onClick={() => handleSaveLote('Finalizado')}
                    className="w-full py-4 bg-sleek-dark text-white rounded font-bold uppercase tracking-widest text-xs hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                  >
                    <Edit2 className="w-4 h-4" /> Guardar Cambios
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={() => handleSaveLote('En Proceso')}
                    className="w-full py-4 bg-sleek-accent text-white rounded font-bold uppercase tracking-widest text-xs hover:bg-sleek-accent/90 transition-all shadow-lg shadow-sleek-accent/20 flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4" /> Iniciar Producción
                  </button>
                  <button 
                    onClick={() => handleSaveLote('Planificado')}
                    className="w-full py-4 bg-white border border-slate-200 text-slate-600 rounded font-bold uppercase tracking-widest text-xs hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                  >
                    <Calendar className="w-4 h-4" /> Guardar como Planificado
                  </button>
                </>
              )}
              <button 
                onClick={() => setView(selectedLote?.estado === 'Finalizado' ? 'detail' : 'list')}
                className="w-full py-4 text-slate-400 font-bold uppercase tracking-widest text-[10px] hover:text-slate-600 transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'detail' && selectedLote) {
    try {
      const prod = productos.find((p: any) => p.id === selectedLote.productoId);
      const unit = unidades.find((u: any) => u.id === prod?.unidadMedidaId);
      const resp = users.find((u: any) => u.id === selectedLote.responsableId);
      const factorEquivalencia = getPesoEquivalente(selectedLote.productoId);
      const totalRealInsumosKg = (selectedLote.insumos || []).reduce((sum: number, ins: any) => sum + ((ins.cantidadReal || 0) * getPesoEquivalente(ins.materiaPrimaId)), 0);

      // --- BUG 2 Logic: Separar Producido vs Stock ---
      const le = lotesEtiquetados.find((item: any) => item.loteId === selectedLote.numeroLote || item.loteId === selectedLote.id);
      const envases = le?.envases || [];
      
      const pesoNetoProducido = formatNum(envases
        .filter((e: any) => e.estado === 'en_stock' || 
                 (e.estado === 'baja' && e.motivoBaja && e.motivoBaja.toLowerCase().includes('vendido')))
        .reduce((sum: number, e: any) => sum + (parseFloat(e.pesoNeto) || 0), 0));

      const stockActual = formatNum(envases
        .filter((e: any) => e.estado === 'en_stock')
        .reduce((sum: number, e: any) => sum + (parseFloat(e.pesoNeto) || 0), 0));

      const despachado = formatNum(envases
        .filter((e: any) => e.estado === 'baja' && e.motivoBaja && e.motivoBaja.toLowerCase().includes('vendido'))
        .reduce((sum: number, e: any) => sum + (parseFloat(e.pesoNeto) || 0), 0));

      // Si no hay envases, usamos los datos guardados en el lote como fallback (compatibilidad)
      const displayProducido = envases.length > 0 ? pesoNetoProducido : (selectedLote.pesoNeto || 0);
      const displayStock = envases.length > 0 ? stockActual : (selectedLote.estado === 'Finalizado' ? selectedLote.pesoNeto : 0);
      const displayDespachado = envases.length > 0 ? despachado : 0;

      const rendimientoProd = totalRealInsumosKg > 0 ? formatNum((displayProducido / totalRealInsumosKg) * 100, 1) : 0;
      const mermaProdKg = formatNum(totalRealInsumosKg - displayProducido, 2);
      const mermaProdPerc = totalRealInsumosKg > 0 ? formatNum((mermaProdKg / totalRealInsumosKg) * 100, 1) : 0;
      
      const receta = recetas.find((r: any) => r.productoTerminadoId === selectedLote.productoId);
      const desvioRendimiento = formatNum(rendimientoProd - (receta?.rendimientoEsperado || 100), 1);

      return (
        <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button onClick={() => setView('list')} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </button>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-bold text-sleek-dark uppercase tracking-widest">Lote {selectedLote.numeroLote}</h2>
                <Badge variant={
                  selectedLote.estado === 'Planificado' ? 'info' :
                  selectedLote.estado === 'En Proceso' ? 'warning' :
                  selectedLote.estado === 'Finalizado' ? 'success' : 'default'
                }>{selectedLote.estado}</Badge>
              </div>
              <p className="text-sm text-slate-400 font-bold uppercase tracking-tight">{prod?.nombre}</p>
            </div>
          </div>
          <div className="flex gap-3">
            {selectedLote.estado === 'En Proceso' && (
              <button 
                onClick={() => {
                  const etiquetado = lotesEtiquetados.find((le: any) => le.loteId === selectedLote.id);
                  const pesoManual = selectedLote.cantidadEstimada;
                  const pesoEtiquetado = etiquetado ? etiquetado.envases.reduce((sum: number, e: any) => sum + e.pesoNeto, 0) : 0;
                  
                  setFinalizeData({
                    pesoBruto: 0,
                    pesoNeto: pesoEtiquetado > 0 ? pesoEtiquetado : pesoManual,
                    unidadesReales: pesoEtiquetado > 0 ? etiquetado.envases.length : (pesoManual / getPesoEquivalente(selectedLote.productoId)),
                    almacenDestinoId: ''
                  });
                  setIsFinalizeModalOpen(true);
                }}
                className="bg-sleek-success text-white px-6 py-2 rounded font-bold text-xs uppercase tracking-widest hover:bg-emerald-600 transition-all flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" /> Finalizar Lote
              </button>
            )}
            {(selectedLote.estado === 'Planificado' || selectedLote.estado === 'En Proceso' || selectedLote.estado === 'Finalizado') && (
              <button onClick={() => handleEditLote(selectedLote)} className="bg-white border border-slate-200 text-slate-600 px-6 py-2 rounded font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2">
                <Edit2 className="w-4 h-4" /> {selectedLote.estado === 'Finalizado' ? 'Editar Lote' : 'Editar'}
              </button>
            )}
            <button className="bg-white border border-slate-200 text-slate-600 px-6 py-2 rounded font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2">
              <Printer className="w-4 h-4" /> Imprimir Etiqueta
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Card className="p-6">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Fecha Elaboración</p>
            <p className="text-sm font-bold text-sleek-dark">{safeFormat(selectedLote.fechaElaboracion, 'dd/MM/yyyy')}</p>
          </Card>
          <Card className="p-6">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Fecha Vencimiento</p>
            <p className="text-sm font-bold text-sleek-dark">{safeFormat(selectedLote.fechaVencimiento, 'dd/MM/yyyy')}</p>
          </Card>
          <Card className="p-6">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Responsable</p>
            <p className="text-sm font-bold text-sleek-dark">{resp?.name || 'No asignado'}</p>
          </Card>
          <Card className="p-6">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Cant. Estimada</p>
            <p className="text-sm font-bold text-sleek-dark">
              {displayNum(selectedLote.cantidadEstimada, 2)} {unit?.abreviatura}
              {unit?.id !== 'u1' && factorEquivalencia > 0 && (
                <span className="text-slate-400 ml-1 text-[10px]">({displayNum(selectedLote.cantidadEstimada * factorEquivalencia, 2)} kg)</span>
              )}
            </p>
          </Card>
        </div>

        {selectedLote.estado === 'Finalizado' && (
          <div className="space-y-6">
            {/* Los 3 indicadores principales de Stock vs Produccion */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-6 bg-sleek-accent text-white relative">
                <div className="absolute top-2 right-2 text-white/30" title="Total producido = envases en stock + envases vendidos. No incluye envases anulados por error.">
                  <AlertCircle className="w-4 h-4 cursor-help" />
                </div>
                <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-2">PESO NETO PRODUCIDO</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold">{displayNum(displayProducido)} kg</p>
                  {unit?.id !== 'u1' && factorEquivalencia > 0 && (
                    <p className="text-sm font-black text-white/40">{displayNum(displayProducido / factorEquivalencia, 1)} {unit?.abreviatura}</p>
                  )}
                </div>
              </Card>

              <Card className={cn("p-6 relative", displayStock > 0 ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400")}>
                <div className="absolute top-2 right-2 opacity-30" title="Mercadería disponible actualmente en almacén.">
                  <AlertCircle className="w-4 h-4 cursor-help" />
                </div>
                <p className={cn("text-[10px] font-bold uppercase tracking-widest mb-2", displayStock > 0 ? "text-white/60" : "text-slate-400")}>STOCK ACTUAL</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold">{displayNum(displayStock)} kg</p>
                  {unit?.id !== 'u1' && factorEquivalencia > 0 && (
                    <p className="text-sm font-black opacity-40">{displayNum(displayStock / factorEquivalencia, 1)} {unit?.abreviatura}</p>
                  )}
                </div>
              </Card>

              <Card className="p-6 bg-sky-500 text-white relative border-sky-400">
                <div className="absolute top-2 right-2 text-white/30" title="Mercadería ya vendida o despachada.">
                  <AlertCircle className="w-4 h-4 cursor-help" />
                </div>
                <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-2">DESPACHADO</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold">{displayNum(displayDespachado)} kg</p>
                  {unit?.id !== 'u1' && factorEquivalencia > 0 && (
                    <p className="text-sm font-black text-white/40">{displayNum(displayDespachado / factorEquivalencia, 1)} {unit?.abreviatura}</p>
                  )}
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="p-6 border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Rendimiento Real</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold text-sleek-dark font-mono">{formatNum(rendimientoProd, 1)}%</p>
                  <div className={cn(
                    "w-3 h-3 rounded-full",
                    rendimientoProd >= 95 ? "bg-sleek-success" : 
                    rendimientoProd >= 85 ? "bg-sleek-warning" : "bg-sleek-danger"
                  )}></div>
                </div>
              </Card>
              <Card className="p-6 border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Merma Total</p>
                <p className="text-2xl font-bold text-sleek-dark font-mono">{formatNum(mermaProdKg, 2)} kg</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase">{formatNum(mermaProdPerc, 1)}% del total</p>
              </Card>
              <Card className="p-6 border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Desvío vs Receta</p>
                <p className={cn(
                  "text-2xl font-bold font-mono",
                  desvioRendimiento < 0 ? "text-sleek-danger" : "text-sleek-success"
                )}>
                  {desvioRendimiento > 0 ? '+' : ''}{formatNum(desvioRendimiento, 1)}%
                </p>
              </Card>
              <Card className="p-6 border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Almacén Destino</p>
                <p className="text-sm font-bold text-sleek-dark">
                  {almacenes.find((a: any) => a.id === selectedLote.almacenDestinoId)?.nombre || '-'}
                </p>
              </Card>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Card className="p-0 overflow-hidden">
              <div className="p-6 border-b border-slate-100">
                <h3 className="text-xs font-bold text-sleek-dark uppercase tracking-widest">Insumos Consumidos</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50">
                    <tr>
                      <th className="px-6 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Materia Prima</th>
                      <th className="px-6 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Teórico</th>
                      <th className="px-6 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Real</th>
                      <th className="px-6 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {selectedLote.insumos.map((ins: any, idx: number) => {
                      const mp = productos.find((p: any) => p.id === ins.materiaPrimaId);
                      const diff = ins.cantidadReal - ins.cantidadTeorica;
                      const diffPerc = (diff / ins.cantidadTeorica) * 100;
                      
                      return (
                        <tr key={idx}>
                          <td className="px-6 py-4">
                            <p className="text-sm font-bold text-sleek-dark">{mp?.nombre}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-bold">{mp?.codigo}</p>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-400 font-mono">{formatNum(ins.cantidadTeorica)}</td>
                          <td className="px-6 py-4 text-sm text-sleek-dark font-bold font-mono">{formatNum(ins.cantidadReal)}</td>
                          <td className="px-6 py-4">
                            <p className={cn(
                              "text-xs font-bold font-mono",
                              diff > 0 ? "text-sleek-danger" : diff < 0 ? "text-sleek-success" : "text-slate-400"
                            )}>
                              {diff > 0 ? '+' : ''}{formatNum(diff)} ({formatNum(ins.cantidadTeorica > 0 ? diffPerc : 0, 1)}%)
                            </p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50/50 font-bold">
                    <tr>
                      <td className="px-6 py-4 text-xs uppercase tracking-widest text-slate-400">Totales</td>
                      <td className="px-6 py-4 text-sm text-slate-400 font-mono">
                        {formatNum((selectedLote.insumos || []).reduce((sum: number, ins: any) => sum + (ins.cantidadTeorica || 0), 0))}
                      </td>
                      <td className="px-6 py-4 text-sm text-sleek-dark font-mono">
                        {formatNum(totalRealInsumosKg)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>

            <Card className="p-0 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h3 className="text-xs font-bold text-sleek-dark uppercase tracking-widest flex items-center gap-2">
                  <Package className="w-4 h-4" /> 📦 PRODUCCIÓN — ENVASES DEL LOTE
                </h3>
                {(() => {
                  const le = lotesEtiquetados.find((item: any) => item.loteId === selectedLote.numeroLote || item.loteId === selectedLote.id);
                  const envs = le?.envases || [];
                  const active = envs.filter((e: any) => {
                    const isAnulado = e.anulado === true || e.anulado === 'true';
                    return !isAnulado && e.estado !== 'baja';
                  });
                  const baja = envs.filter((e: any) => e.anulado || e.estado === 'baja');
                  
                  return (
                    <div className="flex gap-6">
                      <div className="text-center">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Envases</p>
                        <p className="text-xs font-black text-sleek-dark">{envs.length} ({formatNum(envs.reduce((s: number, e: any) => s + e.pesoNeto, 0), 1)} kg)</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mb-1">En Stock</p>
                        <p className="text-xs font-black text-emerald-600">{active.length} ({formatNum(active.reduce((s: number, e: any) => s + e.pesoNeto, 0), 1)} kg)</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[8px] font-black text-rose-500 uppercase tracking-widest mb-1">Baja</p>
                        <p className="text-xs font-black text-rose-600">{baja.length} ({formatNum(baja.reduce((s: number, e: any) => s + e.pesoNeto, 0), 1)} kg)</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="bg-white sticky top-0 border-b border-slate-100 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    <tr>
                      <th className="px-6 py-3">Nº</th>
                      <th className="px-6 py-3">Código Barras</th>
                      <th className="px-6 py-3">Peso Neto</th>
                      <th className="px-6 py-3">Reg. Fecha/Hora</th>
                      <th className="px-6 py-3 text-right">Estado / Obs.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-[10px]">
                    {(() => {
                      const le = lotesEtiquetados.find((item: any) => item.loteId === selectedLote.numeroLote || item.loteId === selectedLote.id);
                      const envs = le?.envases || [];
                      
                      if (envs.length === 0) {
                        return (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-slate-300 italic font-bold uppercase tracking-widest">
                              No hay registros de envases individuales para este lote de producción.
                            </td>
                          </tr>
                        );
                      }

                      return envs.slice().reverse().map((env: any, eidx: number) => {
                        const isBaja = env.anulado || env.estado === 'baja';
                        return (
                          <tr key={eidx} className={cn("transition-colors", isBaja ? "bg-rose-50/20 opacity-60" : "hover:bg-slate-50/50")}>
                            <td className="px-6 py-3 font-bold text-slate-400">#{env.numero}</td>
                            <td className="px-6 py-3 font-mono font-bold text-sleek-dark lowercase">{env.codigoBarras}</td>
                            <td className="px-6 py-3 font-black text-sleek-dark">{env.pesoNeto.toFixed(3)} kg</td>
                            <td className="px-6 py-3 font-bold text-slate-400 uppercase">
                              {safeFormat(env.fechaHora, 'dd/MM/yy HH:mm')}
                            </td>
                            <td className="px-6 py-3 text-right">
                              <div className="flex flex-col items-end gap-1">
                                <Badge variant={isBaja ? 'danger' : 'success'}>
                                  {isBaja ? 'BAJA' : 'EN STOCK'}
                                </Badge>
                                {isBaja && env.motivoBaja && (
                                  <span className="text-[8px] font-bold text-rose-500 uppercase block max-w-[150px] truncate" title={env.motivoBaja}>
                                    {env.motivoBaja}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="text-xs font-bold text-sleek-dark uppercase tracking-widest mb-6 flex items-center gap-2">
                <History className="w-4 h-4" /> Historial del Lote
              </h3>
              <div className="space-y-6 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-px before:bg-slate-100">
                {lotesHistorial
                  .filter((h: any) => h.loteId === selectedLote.id)
                  .map((h: any) => (
                    <div key={h.id} className="relative pl-10">
                      <div className="absolute left-2.5 top-1.5 w-3 h-3 rounded-full bg-white border-2 border-sleek-accent"></div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">{safeFormat(h.fecha, 'dd/MM/yy HH:mm')}</p>
                      <p className="text-xs font-bold text-sleek-dark mb-1">{h.accion}</p>
                      <p className="text-xs text-slate-500">{h.detalle}</p>
                    </div>
                  ))}
              </div>
            </Card>

            {selectedLote.observaciones && (
              <Card className="p-6 bg-slate-50 border-slate-100">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Observaciones</h4>
                <p className="text-sm text-slate-600 italic">"{selectedLote.observaciones}"</p>
              </Card>
            )}
          </div>
        </div>

        {/* Modal Finalizar Lote */}
        <Modal isOpen={isFinalizeModalOpen} onClose={() => setIsFinalizeModalOpen(false)} title="Finalizar Producción">
          <div className="space-y-8">
            <div className="bg-sleek-accent/5 p-6 rounded-xl border border-sleek-accent/10">
              <div className="flex justify-between items-center mb-4">
                <p className="text-xs font-bold text-sleek-accent uppercase tracking-widest">Resumen de Insumos Usados</p>
                <p className="text-xl font-bold text-sleek-accent">{formatNum(totalRealInsumosKg, 2)} kg</p>
              </div>
              <p className="text-[10px] text-slate-500 font-medium">
                El peso neto final no debería exceder el total de insumos usados. La diferencia se registrará como merma.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Peso Bruto (kg)</label>
                <input 
                  type="number" 
                  step="0.001"
                  value={finalizeData.pesoBruto || 0}
                  onChange={e => setFinalizeData({ ...finalizeData, pesoBruto: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sleek-accent"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Peso Neto Final (kg) *</label>
                <div className="space-y-1">
                  <input 
                    type="number" 
                    step="0.001"
                    value={finalizeData.pesoNeto || 0}
                    onChange={e => {
                      const pn = parseFloat(e.target.value) || 0;
                      const prod = productos.find((p: any) => p.id === selectedLote.productoId);
                      const factor = getPesoEquivalente(selectedLote.productoId);
                      setFinalizeData({ ...finalizeData, pesoNeto: pn, unidadesReales: factor > 0 ? Math.round(pn / factor) : 0 });
                    }}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold focus:outline-none focus:border-sleek-accent"
                  />
                  {productos.find((p: any) => p.id === selectedLote.productoId)?.unidadMedidaId !== 'u1' && (
                    <p className="text-[9px] font-bold text-sleek-accent uppercase">
                      Estimado: {(finalizeData.pesoNeto / getPesoEquivalente(selectedLote.productoId)).toFixed(2)} {unidades.find((u: any) => u.id === productos.find((p: any) => p.id === selectedLote.productoId)?.unidadMedidaId)?.abreviatura}
                    </p>
                  )}
                </div>
              </div>

              {productos.find((p: any) => p.id === selectedLote.productoId)?.unidadMedidaId !== 'u1' && (
                <div className="md:col-span-2 bg-sleek-accent/5 p-4 rounded-lg border border-sleek-accent/10">
                  <label className="block text-[10px] font-bold text-sleek-accent uppercase tracking-widest mb-2">Unidades Reales producidas ({unidades.find((u: any) => u.id === productos.find((p: any) => p.id === selectedLote.productoId)?.unidadMedidaId)?.abreviatura}) *</label>
                  <input 
                    type="number" 
                    value={finalizeData.unidadesReales || 0} 
                    onChange={e => setFinalizeData({ ...finalizeData, unidadesReales: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-white border border-sleek-accent/20 rounded-lg text-sm focus:outline-none focus:border-sleek-accent font-black text-sleek-accent"
                  />
                  <p className="text-[9px] text-slate-400 mt-1 italic">Ingresá la cantidad física contada. Se usará para el stock.</p>
                </div>
              )}

              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Almacén de Destino *</label>
                <select 
                  value={finalizeData.almacenDestinoId || ''}
                  onChange={e => setFinalizeData({ ...finalizeData, almacenDestinoId: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sleek-accent"
                >
                  <option value="">Seleccionar Almacén</option>
                  {almacenes.map((a: any) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Rendimiento Estimado</p>
                <p className="text-lg font-bold text-sleek-dark">
                  {totalRealInsumosKg > 0 ? formatNum((finalizeData.pesoNeto / totalRealInsumosKg) * 100, 1) : 0}%
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Merma Estimada</p>
                <p className="text-lg font-bold text-sleek-danger">
                  {formatNum(totalRealInsumosKg - finalizeData.pesoNeto, 2)} kg
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
              <button onClick={() => setIsFinalizeModalOpen(false)} className="px-6 py-2 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600">Cancelar</button>
              <button 
                onClick={handleFinalize}
                disabled={isFinalizing}
                className="px-10 py-3 bg-sleek-success text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-emerald-600 transition-all shadow-lg shadow-sleek-success/20 flex items-center gap-2 disabled:opacity-50 disabled:grayscale"
              >
                <CheckCircle2 className="w-4 h-4" /> {isFinalizing ? 'Finalizando...' : 'Confirmar y Finalizar'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    );
  } catch (err) {
    console.error("Error rendering lote detail:", err);
    return (
      <div className="p-20 text-center bg-white rounded-2xl border border-slate-100 shadow-sm">
        <AlertCircle className="w-16 h-16 mx-auto mb-6 text-sleek-danger opacity-20" />
        <h3 className="text-xl font-bold text-sleek-dark uppercase tracking-widest mb-2">Error de visualización</h3>
        <p className="text-sm text-slate-400 mb-8 max-w-md mx-auto">No se pudieron cargar todos los datos de este lote. Esto puede deberse a registros incompletos o inconsistentes.</p>
        <button 
          onClick={() => setView('list')}
          className="px-8 py-3 bg-sleek-dark text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-slate-800 transition-all flex items-center gap-2 mx-auto"
        >
          <ArrowLeft className="w-4 h-4" /> Volver al listado
        </button>
      </div>
    );
  }
}

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-sleek-dark uppercase tracking-widest">Lotes de Producción</h2>
        <button 
          onClick={handleNewLote}
          className="bg-sleek-dark text-white px-6 py-2 rounded font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nuevo Lote
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text"
            placeholder="Buscar por lote o producto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none transition-all"
          />
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <select 
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value)}
            className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold uppercase tracking-widest text-slate-500 outline-none focus:ring-2 focus:ring-sleek-accent"
          >
            <option value="Todos">Todos los Estados</option>
            <option value="Planificado">Planificado</option>
            <option value="En Proceso">En Proceso</option>
            <option value="Finalizado">Finalizado</option>
            <option value="Cerrado">Cerrado</option>
          </select>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nº Lote</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Producto</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fechas</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cant. / Rend.</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Responsable</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredLotes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center text-slate-300">
                    <Layers className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="font-bold uppercase tracking-widest">No hay lotes registrados</p>
                  </td>
                </tr>
              ) : (
                filteredLotes.map((l: any) => {
                  const prod = productos.find((p: any) => p.id === l.productoId);
                  const unit = unidades.find((u: any) => u.id === prod?.unidadMedidaId);
                  const resp = users.find((u: any) => u.id === l.responsableId);
                  
                  return (
                    <tr key={l.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-sleek-dark font-mono">{l.numeroLote}</span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-sleek-dark">{prod?.nombre}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">{prod?.codigo}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-xs text-slate-600 font-bold">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {safeFormat(l.fechaElaboracion, 'dd/MM/yy')}
                        </div>
                        {l.fechaVencimiento && (
                          <p className="text-[10px] text-slate-400 mt-1">Vence: {safeFormat(l.fechaVencimiento, 'dd/MM/yy')}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {(() => {
                           // --- BUG 1 & 2 in Table View ---
                           const factorEquiv = getPesoEquivalente(l.productoId);
                           const le = lotesEtiquetados.find((item: any) => item.loteId === l.id);
                           const envases = le?.envases || [];
                           
                           // Stock Actual = solo en_stock (Bug 2 Table logic)
                           const stockActualKg = formatNum(envases
                             .filter((e: any) => e.estado === 'en_stock')
                             .reduce((sum: number, e: any) => sum + (parseFloat(e.pesoNeto) || 0), 0));
                           
                           // Fallback para lotes viejos o sin etiquetas
                           const displayStockKg = envases.length > 0 ? stockActualKg : (l.estado === 'Finalizado' ? l.pesoNeto : 0);
                           
                           // Peso Neto Producido para rendimiento
                           const pesoProducidoKg = formatNum(envases
                             .filter((e: any) => e.estado === 'en_stock' || (e.estado === 'baja' && e.motivoBaja?.toLowerCase().includes('vendido')))
                             .reduce((sum: number, e: any) => sum + (parseFloat(e.pesoNeto) || 0), 0));
                           
                           const displayProdKg = envases.length > 0 ? pesoProducidoKg : (l.pesoNeto || 0);
                           const totalInsumosKg = (l.insumos || []).reduce((sum: number, ins: any) => sum + ((ins.cantidadReal || 0) * getPesoEquivalente(ins.materiaPrimaId)), 0);
                           const rendimientoActual = totalInsumosKg > 0 ? formatNum((displayProdKg / totalInsumosKg) * 100, 1) : (l.rendimientoReal || 0);

                           return (
                             <div className="flex flex-col gap-1">
                               <p className="text-sm font-bold text-sleek-dark">
                                 {unit?.id !== 'u1' && factorEquiv > 0 ? formatNum(displayStockKg / factorEquiv) : formatNum(displayStockKg)} {unit?.abreviatura}
                               </p>
                               {unit?.id !== 'u1' && factorEquiv > 0 && (
                                 <p className="text-[10px] text-slate-400 font-bold uppercase">
                                   ({formatNum(displayStockKg)} kg)
                                 </p>
                               )}
                               {envases.length > 0 && (
                                 <p className="text-[9px] font-black text-sleek-accent uppercase">
                                   📦 {envases.filter((e: any) => e.estado === 'en_stock').length} env. stock
                                 </p>
                               )}
                               {(l.estado === 'Finalizado' || l.estado === 'Cerrado') && (
                                 <div className="flex items-center gap-1">
                                   <div className={cn(
                                     "w-2 h-2 rounded-full",
                                     rendimientoActual >= 95 ? "bg-sleek-success" : 
                                     rendimientoActual >= 85 ? "bg-sleek-warning" : "bg-sleek-danger"
                                   )}></div>
                                   <p className="text-[10px] text-slate-400 font-bold font-mono">{formatNum(rendimientoActual, 1)}% rend.</p>
                                 </div>
                               )}
                             </div>
                           );
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={
                          l.estado === 'Planificado' ? 'info' :
                          l.estado === 'En Proceso' ? 'warning' :
                          l.estado === 'Finalizado' ? 'success' : 'default'
                        }>{l.estado}</Badge>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-600 uppercase">
                        {resp?.name}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => { setSelectedLote(l); setView('detail'); }} 
                            className="p-2 text-slate-400 hover:text-sleek-accent transition-colors"
                            title="Ver Detalle"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {l.estado !== 'Cerrado' && l.estado !== 'Finalizado' && (
                            <button 
                              onClick={() => handleEditLote(l)} 
                              className="p-2 text-slate-400 hover:text-sleek-accent transition-colors"
                              title="Editar"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {l.estado === 'Planificado' && (
                            <button 
                              onClick={() => {
                                confirmDialog('¿Eliminar este lote planificado?', () => {
                                  setLotesProduccion(lotesProduccion.filter((item: any) => item.id !== l.id));
                                  showNotification('Lote eliminado', 'success');
                                });
                              }} 
                              className="p-2 text-slate-400 hover:text-sleek-danger transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
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
  );
};

const LotesDespieceView = ({ 
  lotesDespiece, setLotesDespiece, 
  lotesDespieceHistorial, setLotesDespieceHistorial,
  plantillasDespiece, productos, almacenes, 
  lotesStock,
  movimientos, setMovimientos,
  unidades, users, currentUser, showNotification, getPesoEquivalente,
  lotesEtiquetados, setLotesEtiquetados, setDescuentosPendientes
}: any) => {
  const [view, setView] = useState<'list' | 'form' | 'detail'>('list');
  const [selectedLote, setSelectedLote] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState('Todos');
  const [isFinalizing, setIsFinalizing] = useState(false);

  const [formData, setFormData] = useState<any>({
    numeroLote: '',
    materiaPrimaId: '',
    cantidadIngresada: 0,
    fechaElaboracion: safeFormat(new Date(), 'yyyy-MM-dd'),
    fechaVencimiento: '',
    responsableId: currentUser.id,
    observaciones: '',
    cortes: []
  });

  const handleNewLote = () => {
    const nextNum = lotesDespiece.length > 0 ? Math.max(...lotesDespiece.map((l: any) => parseInt(l.numeroLote.split('-')[1]) || 0)) + 1 : 1;
    setFormData({
      numeroLote: `D-${nextNum.toString().padStart(4, '0')}`,
      materiaPrimaId: '',
      cantidadIngresada: 0,
      fechaElaboracion: safeFormat(new Date(), 'yyyy-MM-dd'),
      fechaVencimiento: '',
      responsableId: currentUser.id,
      observaciones: '',
      cortes: []
    });
    setSelectedLote(null);
    setView('form');
  };

  const handleMateriaPrimaChange = (mpId: string) => {
    const plantilla = plantillasDespiece.find((p: any) => p.materiaPrimaId === mpId);
    const mp = productos.find((p: any) => p.id === mpId);
    
    let cortes = [];
    if (plantilla) {
      cortes = plantilla.cortes.map((c: any) => {
        const factor = getPesoEquivalente(c.productoId);
        const esperadaKg = (c.rendimientoEsperado / 100) * formData.cantidadIngresada;
        return {
          ...c,
          cantidadEsperada: esperadaKg,
          cantidadReal: esperadaKg,
          unidadesReales: factor > 0 ? Math.round(esperadaKg / factor) : 0,
          almacenDestinoId: ''
        };
      });
    }

    setFormData({
      ...formData,
      materiaPrimaId: mpId,
      cortes,
      fechaVencimiento: mp?.vidaUtil?.valor ? safeFormat(addDays(parseISO(formData.fechaElaboracion), mp.vidaUtil.unidad === 'meses' ? mp.vidaUtil.valor * 30 : mp.vidaUtil.valor), 'yyyy-MM-dd', '') : ''
    });
  };

  const handleCantidadIngresadaChange = (val: number) => {
    const plantilla = plantillasDespiece.find((p: any) => p.materiaPrimaId === formData.materiaPrimaId);
    const newCortes = formData.cortes.map((c: any) => {
      const factor = getPesoEquivalente(c.productoId);
      const esperadaKg = plantilla ? (c.rendimientoEsperado / 100) * val : 0;
      return {
        ...c,
        cantidadEsperada: esperadaKg,
        cantidadReal: esperadaKg,
        unidadesReales: factor > 0 ? Math.round(esperadaKg / factor) : 0
      };
    });
    setFormData({ ...formData, cantidadIngresada: val, cortes: newCortes });
  };

  const handleSaveLote = (estado: 'Planificado' | 'En Proceso' | 'Finalizado') => {
    if (!formData.materiaPrimaId || formData.cantidadIngresada <= 0) {
      showNotification('Complete los campos obligatorios', 'error');
      return;
    }

    const now = new Date().toISOString();
    const detail = selectedLote ? `Edición de lote ${formData.numeroLote}` : `Creación de lote ${formData.numeroLote}`;

    if (selectedLote) {
      // If editing existing or continuing, pre-fill from labels if available
      const updatedCortes = formData.cortes.map((c: any) => {
        const key = `${selectedLote.id}-${c.productoId}`;
        const le = lotesEtiquetados.find((item: any) => item.loteId === key);
        if (le && le.envases.length > 0) {
          const totalEtiquetado = le.envases.reduce((sum: number, e: any) => sum + e.pesoNeto, 0);
          return {
            ...c,
            cantidadReal: totalEtiquetado,
            unidadesReales: le.envases.length
          };
        }
        return c;
      });

      const updatedLote = { ...formData, cortes: updatedCortes, estado };
      setLotesDespiece(lotesDespiece.map((l: any) => l.id === selectedLote.id ? updatedLote : l));

      // Sync label almacenIds to match corte almacenDestinoId (single source of truth)
      const updatedLabels = lotesEtiquetados.map((le: any) => {
        if (le.parentLoteId === selectedLote.id) {
          const corte = updatedCortes.find((c: any) => c.productoId === le.productoId);
          if (corte?.almacenDestinoId) {
            return { ...le, almacenId: corte.almacenDestinoId };
          }
        }
        return le;
      });
      setLotesEtiquetados(updatedLabels);

      if (estado === 'Finalizado') {
        const oldCortes = selectedLote.cortes || [];
        const transferMovs: Movimiento[] = [];
        let transferCount = 0;

        updatedCortes.forEach((c: any, idx: number) => {
          const oldC = oldCortes.find((oc: any) => oc.productoId === c.productoId);
          if (!oldC) return;
          const oldAlmacen = oldC.almacenDestinoId;
          const newAlmacen = c.almacenDestinoId;
          if (!oldAlmacen || !newAlmacen || oldAlmacen === newAlmacen) return;

          const prod = productos.find((p: any) => p.id === c.productoId);
          const usesUnits = prod?.unidadMedidaId !== 'u1';
          const cantidadRealNum = parseFloat(c.cantidadReal) || 0;
          const cantidadMove = usesUnits ? (c.unidadesReales || 0) : cantidadRealNum;
          if (cantidadMove <= 0) return;
          const unitCut = unidades.find((u: any) => u.id === prod?.unidadMedidaId)?.abreviatura || 'kg';
          const cantidadKg = cantidadRealNum;
          const vencDate = prod?.vidaUtil?.valor
            ? safeFormat(addDays(parseISO(formData.fechaElaboracion), prod.vidaUtil.unidad === 'meses' ? prod.vidaUtil.valor * 30 : prod.vidaUtil.valor), 'yyyy-MM-dd')
            : formData.fechaVencimiento;

          const nombreAlmacenViejo = almacenes.find((a: any) => a.id === oldAlmacen)?.nombre || String(oldAlmacen);
          const nombreAlmacenNuevo = almacenes.find((a: any) => a.id === newAlmacen)?.nombre || String(newAlmacen);
          const motivo = `Transferencia: ${nombreAlmacenViejo} → ${nombreAlmacenNuevo} (Lote ${formData.numeroLote})`;

          const base = {
            productoId: c.productoId,
            cantidad: cantidadMove,
            unidad: unitCut,
            cantidadKg,
            motivo,
            loteNumero: `${formData.numeroLote}-${idx + 1}`,
            fechaIngreso: safeFormat(new Date(), 'yyyy-MM-dd'),
            fechaVencimiento: vencDate,
            origen: 'transferencia' as const,
            usuario: currentUser.name,
            fechaHora: now,
            anulado: false,
            referencia: formData.numeroLote,
            observaciones: ''
          };

          transferMovs.push(
            { ...base, id: `MOV-${Date.now()}-${Math.random()}`, tipo: 'salida' as const, almacenId: oldAlmacen },
            { ...base, id: `MOV-${Date.now()}-${Math.random()}`, tipo: 'entrada' as const, almacenId: newAlmacen }
          );
          transferCount += 1;
        });

        if (transferMovs.length > 0) {
          setMovimientos([...transferMovs, ...movimientos]);
          showNotification(`Se generaron ${transferCount} transferencia(s) de almacén`, 'success');
        }
      }
      
      const historyEntry: LoteDespieceHistorial = {
        id: `ldh-${Date.now()}`,
        loteId: selectedLote.id,
        fecha: now,
        usuarioId: currentUser.id,
        accion: 'Modificación',
        detalle: detail
      };
      setLotesDespieceHistorial([historyEntry, ...lotesDespieceHistorial]);
    } else {
      const newId = `ld-${Date.now()}`;
      const newLote = { ...formData, id: newId, estado };
      setLotesDespiece([...lotesDespiece, newLote]);

      const historyEntry: LoteDespieceHistorial = {
        id: `ldh-${Date.now()}`,
        loteId: newId,
        fecha: now,
        usuarioId: currentUser.id,
        accion: 'Creación',
        detalle: detail
      };
      setLotesDespieceHistorial([historyEntry, ...lotesDespieceHistorial]);
    }

    const saveMsg = estado === 'Planificado' ? 'planificado' : estado === 'Finalizado' ? 'guardado' : 'iniciado';
    showNotification(`Lote ${saveMsg} correctamente`, 'success');
    setView(estado === 'Finalizado' && selectedLote ? 'detail' : 'list');
  };

const handleFinalize = () => {
    if (formData.estado === 'Finalizado') {
      showNotification('Este lote ya fue finalizado.', 'error');
      setView('list');
      return;
    }

    const allCortesHaveAlmacen = formData.cortes.every((c: any) => c.almacenDestinoId);
    if (!allCortesHaveAlmacen) {
      showNotification('Asigne un almacén de destino para todos los cortes', 'error');
      return;
    }

    setIsFinalizing(true);

    const now = new Date().toISOString();
    
    // Check stock of MP
    const stockMP = lotesStock.filter((ls: any) => ls.productoId === formData.materiaPrimaId).reduce((sum: number, ls: any) => sum + ls.cantidad, 0);
    if (stockMP < formData.cantidadIngresada) {
       const pending = {
         id: `dp-${Date.now()}-${Math.random()}`,
         loteId: selectedLote?.id || `ld-${Date.now()}`,
         loteNumero: formData.numeroLote,
         productoId: formData.materiaPrimaId,
         cantidadSolicitada: formData.cantidadIngresada,
         cantidadDisponible: stockMP,
         pendiente: formData.cantidadIngresada - stockMP,
         fecha: now
       };
       setDescuentosPendientes((prev: any) => [...prev, pending]);
       showNotification('Aviso: Stock insuficiente de materia prima. Se registró el descuento pendiente.', 'error');
    }

    // Anular movimientos previos si existen para este lote (para evitar duplicados al re-finalizar tras editar)
    const updatedMovimientos = movimientos.map((m: any) => {
      const isAlreadyAnulado = m.anulado === true || m.anulado === 'true' || m.estado === 'anulado';
      if (m.referencia === formData.numeroLote && !isAlreadyAnulado) {
        return { ...m, anulado: true };
      }
      return m;
    });

    const addedMovimientos: any[] = [];
    const prodMP = productos.find((p: any) => p.id === formData.materiaPrimaId);
    const unitMP = unidades.find((u: any) => u.id === prodMP?.unidadMedidaId)?.abreviatura || 'kg';

    // Update stock (FEFO) for MP - Only what's available
    let remainingToDeduct = formData.cantidadIngresada;
    const productLotesMP = [...lotesStock]
      .filter((ls: any) => ls.productoId === formData.materiaPrimaId)
      .sort((a, b) => new Date(a.fechaVencimiento).getTime() - new Date(b.fechaVencimiento).getTime());

    productLotesMP.forEach((ls: any) => {
      if (remainingToDeduct <= 0) return;
      const deduct = Math.min(ls.cantidad, remainingToDeduct);
      remainingToDeduct -= deduct;

      addedMovimientos.push({
        id: `MOV-${Date.now()}-${Math.random()}`,
        tipo: 'salida',
        productoId: formData.materiaPrimaId,
        almacenId: ls.almacenId,
        cantidad: deduct,
        unidad: unitMP,
        cantidadKg: deduct * getPesoEquivalente(formData.materiaPrimaId),
        motivo: `Consumo Despiece Lote ${formData.numeroLote}`,
        loteNumero: ls.numeroLote,
        fechaIngreso: safeFormat(new Date(), 'yyyy-MM-dd'),
        fechaVencimiento: ls.fechaVencimiento,
        origen: 'despiece',
        usuario: currentUser.name,
        fechaHora: now,
        anulado: false,
        referencia: formData.numeroLote
      });
    });

    // Calculate final quantities from labels if they exist
    const finalCortes = formData.cortes.map((c: any) => {
      const key = `${selectedLote?.id || formData.id}-${c.productoId}`;
      const le = lotesEtiquetados.find((item: any) => item.loteId === key);
      const hasLabels = le && le.envases?.length > 0;
      const qty = hasLabels ? le.envases.filter((e: any) => !e.anulado).reduce((s: number, e: any) => s + e.pesoNeto, 0) : (parseFloat(c.cantidadReal) || 0);
      const factor = getPesoEquivalente(c.productoId);
      return {
        ...c,
        cantidadReal: qty,
        unidadesReales: hasLabels ? le.envases.length : (factor > 0 ? Math.round(qty / factor) : c.unidadesReales)
      };
    });

    // Add finished cuts stock
    finalCortes.forEach((c: any, idx: number) => {
      if (c.cantidadReal <= 0) return;
      
      const prod = productos.find((p: any) => p.id === c.productoId);
      const usesUnits = prod?.unidadMedidaId !== 'u1';
      const finalStockQty = usesUnits ? (c.unidadesReales || 0) : c.cantidadReal;
      const unitCut = unidades.find((u: any) => u.id === prod?.unidadMedidaId)?.abreviatura || 'kg';
      const vencDate = prod?.vidaUtil?.valor ? safeFormat(addDays(parseISO(formData.fechaElaboracion), prod.vidaUtil.unidad === 'meses' ? prod.vidaUtil.valor * 30 : prod.vidaUtil.valor), 'yyyy-MM-dd') : formData.fechaVencimiento;

      addedMovimientos.push({
        id: `MOV-${Date.now()}-${idx}-ent`,
        tipo: 'entrada',
        productoId: c.productoId,
        almacenId: c.almacenDestinoId,
        cantidad: finalStockQty,
        unidad: unitCut,
        cantidadKg: c.cantidadReal,
        motivo: `Ingreso Despiece Lote ${formData.numeroLote}`,
        loteNumero: `${formData.numeroLote}-${idx + 1}`,
        fechaIngreso: safeFormat(new Date(), 'yyyy-MM-dd'),
        fechaVencimiento: vencDate,
        origen: 'despiece',
        usuario: currentUser.name,
        fechaHora: now,
        anulado: false,
        referencia: formData.numeroLote
      });
    });

    const totalCortesKg = finalCortes.reduce((sum: number, c: any) => sum + formatNum(c.cantidadReal), 0);
    const cantidadIngresadaKg = formatNum(parseFloat(formData.cantidadIngresada) || 0);
    const rendimientoReal = cantidadIngresadaKg > 0 ? formatNum((totalCortesKg / cantidadIngresadaKg) * 100, 1) : 0;

    const finalizedLote = { 
      ...formData, 
      id: selectedLote?.id || formData.id || `ld-${Date.now()}`,
      cortes: finalCortes,
      estado: 'Finalizado',
      rendimientoReal,
      totalCortes: totalCortesKg,
      fechaFinalizacion: now
    };

    if (selectedLote) {
      setLotesDespiece(lotesDespiece.map((l: any) => l.id === selectedLote.id ? finalizedLote : l));
    } else {
      setLotesDespiece([...lotesDespiece, finalizedLote]);
    }
    setMovimientos([...addedMovimientos, ...updatedMovimientos]);
    
    // Update label status if exists
    const leData = lotesEtiquetados.find((le: any) => le.loteId === finalizedLote.id);
    if (leData && leData.estado !== 'finalizado') {
       setLotesEtiquetados(lotesEtiquetados.map((le: any) => 
         le.loteId === leData.loteId ? { ...le, estado: 'finalizado' } : le
       ));
    }

    const historyEntry: LoteDespieceHistorial = {
      id: `ldh-${Date.now()}`,
      loteId: selectedLote?.id || finalizedLote.id,
      fecha: now,
      usuarioId: currentUser.id,
      accion: 'Finalización',
      detalle: `Lote finalizado con rendimiento real del ${rendimientoReal.toFixed(1)}%`
    };
    setLotesDespieceHistorial([historyEntry, ...lotesDespieceHistorial]);

    setIsFinalizing(false);
    showNotification('Lote de despiece finalizado correctamente', 'success');
    setSelectedLote(finalizedLote);
    setView('detail');
  };

  const filteredLotes = lotesDespiece.filter((l: any) => {
    const mpId = getLoteField(l, 'materia_prima');
    const loteNum = getLoteField(l, 'numeroLote') || '';
    const estado = getLoteField(l, 'estado');
    
    const prod = productos.find((p: any) => p.id === mpId);
    const matchesSearch = loteNum.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (prod?.nombre || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEstado = filterEstado === 'Todos' || estado === filterEstado;
    return matchesSearch && matchesEstado;
  }).sort((a: any, b: any) => {
    const fechaA = new Date(getLoteField(a, 'fecha') || 0).getTime();
    const fechaB = new Date(getLoteField(b, 'fecha') || 0).getTime();
    return fechaB - fechaA;
  });

  if (view === 'detail' && selectedLote) {
    const mpId = getLoteField(selectedLote, 'materia_prima');
    const mp = productos.find((p: any) => p.id === mpId);
    const resp = users.find((u: any) => u.id === selectedLote.responsableId);
    const estado = getLoteField(selectedLote, 'estado');

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button onClick={() => { setSelectedLote(null); setView('list'); }} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </button>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-bold text-sleek-dark uppercase tracking-widest">Lote {selectedLote.numeroLote}</h2>
                <Badge variant={estado === 'Finalizado' ? 'success' : 'warning'}>{estado}</Badge>
              </div>
              <p className="text-sm text-slate-400 font-bold uppercase tracking-tight">{mp?.nombre}</p>
            </div>
          </div>
          <button
            onClick={() => { setFormData(selectedLote); setView('form'); }}
            className="bg-sleek-dark text-white px-6 py-2 rounded font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2"
          >
            <Edit2 className="w-4 h-4" /> Editar Lote
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-6">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Cant. ingresada</p>
            <p className="text-lg font-bold text-sleek-dark">{displayNum(selectedLote.cantidadIngresada, 2)} kg</p>
          </Card>
          <Card className="p-6">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Rendimiento</p>
            <p className="text-lg font-bold text-sleek-dark">{displayNum(selectedLote.rendimientoReal || 0, 1)}%</p>
          </Card>
          <Card className="p-6">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Responsable</p>
            <p className="text-lg font-bold text-sleek-dark">{resp?.name || '-'}</p>
          </Card>
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-xs font-bold text-sleek-dark uppercase tracking-widest">Cortes (lectura)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/50">
                <tr>
                  <th className="px-6 py-3 text-[9px] font-bold text-slate-400 uppercase">Corte</th>
                  <th className="px-6 py-3 text-[9px] font-bold text-slate-400 uppercase">Real (kg)</th>
                  <th className="px-6 py-3 text-[9px] font-bold text-slate-400 uppercase">Almacén</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(selectedLote.cortes || []).map((c: any) => {
                  const pr = productos.find((p: any) => p.id === c.productoId);
                  const alm = almacenes.find((a: any) => a.id === c.almacenDestinoId);
                  const key = `${selectedLote.id}-${c.productoId}`;
                  const le = lotesEtiquetados.find((item: any) => item.loteId === key);
                  const qty = le && le.envases?.length
                    ? le.envases.filter((e: any) => !e.anulado && e.estado !== 'baja').reduce((s: number, e: any) => s + e.pesoNeto, 0)
                    : (parseFloat(c.cantidadReal) || 0);
                  return (
                    <tr key={c.productoId}>
                      <td className="px-6 py-3 font-bold text-sleek-dark">{pr?.nombre}</td>
                      <td className="px-6 py-3 font-mono">{displayNum(qty, 3)}</td>
                      <td className="px-6 py-3 text-xs font-bold text-slate-600">{alm?.nombre || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  if (view === 'form') {
    const totalCortesKg = formData.cortes.reduce((sum: number, c: any) => {
      const key = `${selectedLote?.id || formData.id}-${c.productoId}`;
      const le = lotesEtiquetados.find((item: any) => item.loteId === key);
      const hasLabels = le && le.envases?.length > 0;
      const qty = hasLabels ? le.envases.filter((e: any) => !e.anulado).reduce((s: number, e: any) => s + e.pesoNeto, 0) : (parseFloat(c.cantidadReal) || 0);
      return sum + formatNum(qty);
    }, 0);
    const cantidadIngresadaKg = formatNum(parseFloat(formData.cantidadIngresada) || 0);
    const rendimientoReal = cantidadIngresadaKg > 0 ? formatNum((totalCortesKg / cantidadIngresadaKg) * 100, 1) : 0;
    const mermaRealKg = formatNum(cantidadIngresadaKg - totalCortesKg);
    const mermaPerc = formatNum(100 - rendimientoReal, 1);

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center gap-4">
          <button onClick={() => setView(selectedLote?.estado === 'Finalizado' ? 'detail' : 'list')} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </button>
          <h2 className="text-2xl font-bold text-sleek-dark uppercase tracking-widest">
            {selectedLote ? 'Editar Lote' : 'Nuevo Lote de Despiece'}
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card className="p-8">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Datos de Entrada
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Número de Lote *</label>
                  <input 
                    type="text" 
                    value={formData.numeroLote || ''} 
                    onChange={e => setFormData({ ...formData, numeroLote: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Materia Prima a Despostar *</label>
                  <select 
                    value={formData.materiaPrimaId || ''} 
                    onChange={e => handleMateriaPrimaChange(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent"
                  >
                    <option value="">Seleccionar Materia Prima</option>
                    {productos.filter((p: any) => p.tipo === 'Materia Prima' && plantillasDespiece.some((pl: any) => pl.materiaPrimaId === p.id)).map((p: any) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Cantidad Ingresada (kg) *</label>
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-2">
                      <input 
                        type="number" 
                        step="0.01"
                        value={formData.cantidadIngresada || 0} 
                        onChange={e => handleCantidadIngresadaChange(parseFloat(e.target.value) || 0)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent font-bold"
                      />
                      <span className="flex items-center text-xs font-bold text-slate-400 uppercase">
                        kg
                      </span>
                    </div>
                    {formData.materiaPrimaId && productos.find((p: any) => p.id === formData.materiaPrimaId)?.unidadMedidaId !== 'u1' && (
                      <p className="text-[9px] font-bold text-sleek-accent uppercase">
                        Equivale a aproximadamente {formatNum(formData.cantidadIngresada / getPesoEquivalente(formData.materiaPrimaId), 2)} {unidades.find((u: any) => u.id === productos.find((p: any) => p.id === formData.materiaPrimaId)?.unidadMedidaId)?.abreviatura || 'un'}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Responsable *</label>
                  <select 
                    value={formData.responsableId || ''} 
                    onChange={e => setFormData({ ...formData, responsableId: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-sleek-accent"
                  >
                    {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>
            </Card>

            <Card className="p-0 overflow-hidden">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Layers className="w-4 h-4" /> Cortes Obtenidos
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50">
                    <tr>
                      <th className="px-8 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Corte</th>
                      <th className="px-8 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Esperado (kg)</th>
                      <th className="px-8 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Real (kg)</th>
                      <th className="px-8 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-sleek-accent">Unidades Real</th>
                      <th className="px-8 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Almacén Destino</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {formData.cortes.map((c: any, idx: number) => {
                      const prod = productos.find((p: any) => p.id === c.productoId);
                      
                      // BUG 4: Check if cut has labels
                      const key = `${selectedLote?.id || formData.id}-${c.productoId}`;
                      const le = lotesEtiquetados.find((item: any) => item.loteId === key);
                      const hasLabels = le && le.envases?.length > 0;
                      const etiquetadoQty = hasLabels ? le.envases.filter((e: any) => !e.anulado).reduce((sum: number, e: any) => sum + e.pesoNeto, 0) : 0;
                      const currentQty = hasLabels ? etiquetadoQty : c.cantidadReal;

                      return (
                        <tr key={idx} className={cn(hasLabels && "bg-sleek-accent/5")}>
                          <td className="px-8 py-4">
                            <p className="text-sm font-bold text-sleek-dark">{prod?.nombre}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-bold">{prod?.codigo}</p>
                            {hasLabels && <p className="text-[8px] font-black text-sleek-accent uppercase mt-1">📦 Desde etiquetas</p>}
                          </td>
                          <td className="px-8 py-4 text-sm text-slate-400 font-mono">{formatNum(c.cantidadEsperada, 2)}</td>
                          <td className="px-8 py-4 text-sm font-bold text-sleek-dark">
                             {hasLabels ? (
                               <div className="flex flex-col">
                                 <span>{displayNum(currentQty, 3)} kg</span>
                                 <span className="text-[8px] text-sleek-accent font-bold uppercase tracking-tighter">Lectura de etiquetas</span>
                               </div>
                             ) : (
                               <input
                                 type="number"
                                 step="0.001"
                                 min="0"
                                 value={c.cantidadReal || ''}
                                 disabled={selectedLote?.estado === 'Finalizado'}
                                 onChange={e => {
                                   const val = parseFloat(e.target.value) || 0;
                                   const factor = getPesoEquivalente(c.productoId);
                                   const newCortes = [...formData.cortes];
                                   newCortes[idx] = {
                                     ...newCortes[idx],
                                     cantidadReal: val,
                                     unidadesReales: factor > 0 ? Math.round(val / factor) : newCortes[idx].unidadesReales
                                   };
                                   setFormData({ ...formData, cortes: newCortes });
                                 }}
                                 className="w-28 px-3 py-2 bg-white border border-slate-200 rounded text-sm font-bold text-sleek-dark focus:outline-none focus:border-sleek-accent focus:ring-1 focus:ring-sleek-accent/30 disabled:opacity-50 disabled:cursor-not-allowed"
                                 placeholder="0.000"
                               />
                             )}
                          </td>
                          <td className="px-8 py-4">
                            {prod?.unidadMedidaId !== 'u1' ? (
                              hasLabels ? (
                                <div className="p-1 text-xs font-black text-sleek-dark">
                                  {le.envases.filter((e: any) => !e.anulado).length}
                                  <span className="ml-1 text-slate-300 font-bold uppercase text-[9px]">un.</span>
                                </div>
                              ) : (
                                <input
                                  type="number"
                                  step="1"
                                  min="0"
                                  value={c.unidadesReales || ''}
                                  onChange={e => {
                                    const newCortes = [...formData.cortes];
                                    newCortes[idx] = { ...newCortes[idx], unidadesReales: parseInt(e.target.value) || 0 };
                                    setFormData({ ...formData, cortes: newCortes });
                                  }}
                                  className="w-20 px-3 py-2 bg-white border border-slate-200 rounded text-sm font-bold text-sleek-dark focus:outline-none focus:border-sleek-accent focus:ring-1 focus:ring-sleek-accent/30"
                                  placeholder="0"
                                />
                              )
                            ) : (
                              <span className="text-[10px] text-slate-300 font-bold uppercase">N/A (KG)</span>
                            )}
                          </td>
                          <td className="px-8 py-4">
                            <select 
                              value={c.almacenDestinoId || ''}
                              onChange={e => {
                                const newCortes = [...formData.cortes];
                                newCortes[idx].almacenDestinoId = e.target.value;
                                setFormData({ ...formData, cortes: newCortes });
                              }}
                              className="w-full bg-transparent text-xs focus:outline-none"
                            >
                              <option value="">Seleccionar</option>
                              {almacenes.map((a: any) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                    {formData.cortes.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-8 py-12 text-center text-slate-300 italic text-sm">
                          Seleccione una materia prima para cargar cortes automáticamente
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Resumen de Rendimiento</h3>
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest mb-2">
                    <span className="text-slate-400">Rendimiento Real</span>
                    <span className={cn(rendimientoReal >= 90 ? "text-sleek-success" : "text-sleek-warning")}>{displayNum(rendimientoReal, 1)}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={cn("h-full transition-all", rendimientoReal >= 90 ? "bg-sleek-success" : "bg-sleek-warning")} style={{ width: `${displayNum(rendimientoReal, 1)}%` }}></div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Cortes</p>
                    <p className="text-lg font-bold text-sleek-dark">{displayNum(totalCortesKg, 3)} kg</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Merma Real</p>
                    <p className={cn("text-lg font-bold", mermaRealKg > 0 ? "text-sleek-danger" : "text-sleek-success")}>{displayNum(mermaRealKg, 3)} kg</p>
                  </div>
                </div>
              </div>
            </Card>

            <div className="flex flex-col gap-3">
              {selectedLote?.estado === 'Finalizado' ? (
                <>
                  <div className="bg-sleek-success/10 border-2 border-sleek-success/20 p-6 rounded-xl flex flex-col items-center gap-3">
                    <CheckCircle2 className="w-10 h-10 text-sleek-success" />
                    <p className="text-sm font-black text-sleek-success uppercase tracking-widest text-center">✅ LOTE FINALIZADO</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest text-center">
                      Cortes cargados en almacén
                    </p>
                  </div>
                  <button 
                    onClick={() => handleSaveLote('Finalizado')}
                    className="w-full py-4 bg-sleek-dark text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                  >
                    <Edit2 className="w-4 h-4" /> Guardar Cambios
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={() => handleSaveLote('Planificado')}
                    className="w-full py-4 bg-white border-2 border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-slate-50 transition-all"
                  >
                    Guardar como Planificado
                  </button>
                  <button 
                    onClick={() => handleSaveLote('En Proceso')}
                    className="w-full py-4 bg-sleek-accent text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-sleek-accent/90 transition-all shadow-lg shadow-sleek-accent/20"
                  >
                    {selectedLote ? 'Guardar Cambios' : 'Iniciar Despiece'}
                  </button>
                  {formData.estado === 'En Proceso' && (
                    <button 
                      type="button"
                      onClick={() => handleFinalize()}
                      disabled={isFinalizing}
                      className="w-full py-4 bg-sleek-success text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" /> {isFinalizing ? 'Finalizando...' : 'Finalizar lote de despiece'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-sleek-dark uppercase tracking-widest">Lotes de Despiece</h2>
        <button 
          onClick={handleNewLote}
          className="bg-sleek-dark text-white px-6 py-2 rounded font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nuevo Lote
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text"
            placeholder="Buscar por lote o materia prima..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none transition-all"
          />
        </div>
        <select 
          value={filterEstado}
          onChange={(e) => setFilterEstado(e.target.value)}
          className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold uppercase tracking-widest text-slate-500 outline-none focus:ring-2 focus:ring-sleek-accent"
        >
          <option value="Todos">Todos los Estados</option>
          <option value="Planificado">Planificado</option>
          <option value="En Proceso">En Proceso</option>
          <option value="Finalizado">Finalizado</option>
        </select>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nº Lote</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">MP Despostada</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fechas</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cant. Ingresada</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Rendimiento</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredLotes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center text-slate-300">
                    <Layers className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="font-bold uppercase tracking-widest">No hay lotes de despiece</p>
                  </td>
                </tr>
              ) : (
                filteredLotes.map((l: any) => {
                  const mpId = getLoteField(l, 'materia_prima');
                  const loteNum = getLoteField(l, 'numeroLote');
                  const estado = getLoteField(l, 'estado');
                  const fechaElab = getLoteField(l, 'fecha');
                  const fechaVenc = getLoteField(l, 'vencimiento');
                  const cantidad = getLoteField(l, 'cantidad');
                  const rendimiento = l.rendimientoReal || 0;

                  const prod = productos.find((p: any) => p.id === mpId);
                  
                  return (
                    <tr key={l.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-sleek-dark font-mono">{loteNum}</span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-sleek-dark">{prod?.nombre}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">{prod?.codigo}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {safeFormat(fechaElab, 'dd/MM/yy')}
                          </p>
                          <p className="text-[10px] font-medium text-slate-400">
                            Vence: {fechaVenc ? safeFormat(fechaVenc, 'dd/MM/yy') : '-'}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-600">
                        {displayNum(cantidad, 1)} kg
                        {(() => {
                           // For despiece, sum all cut labels related to this parent Lote
                           const labelsForThisLote = lotesEtiquetados.filter((item: any) => item.parentLoteId === l.id);
                           if (labelsForThisLote.length === 0) return null;
                           
                           const totalEnvases = labelsForThisLote.reduce((sum: number, le: any) => sum + le.envases.length, 0);
                           const totalPeso = labelsForThisLote.reduce((sum: number, le: any) => sum + le.envases.reduce((s: number, e: any) => s + (e.pesoNeto || 0), 0), 0);
                           
                           if (totalEnvases === 0) return null;
   
                           return (
                             <p className="text-[10px] font-black text-sleek-accent uppercase mt-1 flex items-center gap-1">
                               📦 {totalEnvases} env. | {displayNum(totalPeso, 1)} kg
                             </p>
                           );
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        {estado === 'Finalizado' ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-sleek-dark">{displayNum(rendimiento, 1)}%</span>
                            <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-sleek-success" style={{ width: `${displayNum(rendimiento, 1)}%` }}></div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={
                          estado === 'Planificado' ? 'info' :
                          estado === 'En Proceso' ? 'warning' : 'success'
                        }>{estado}</Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => {
                              setSelectedLote(l);
                              setFormData(l);
                              setView(getLoteField(l, 'estado') === 'Finalizado' ? 'detail' : 'form');
                            }} 
                            className="p-2 text-slate-400 hover:text-sleek-accent transition-colors"
                            title={getLoteField(l, 'estado') === 'Finalizado' ? 'Ver detalle' : 'Abrir'}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {getLoteField(l, 'estado') !== 'Finalizado' && (
                            <button 
                              onClick={() => { setSelectedLote(l); setFormData(l); setView('form'); }} 
                              className="p-2 text-slate-400 hover:text-sleek-accent transition-colors"
                              title="Editar"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
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
  );
};

const EtiquetasView = ({ 
  lotesProduccion, 
  setLotesProduccion,
  lotesDespiece, 
  setLotesDespiece,
  lotesHistorial,
  setLotesHistorial,
  lotesDespieceHistorial,
  setLotesDespieceHistorial,
  productos, 
  almacenes,
  recetas,
  plantillasDespiece,
  movimientos,
  setMovimientos,
  lotesStock,
  unidades,
  familias, 
  subfamilias, 
  currentUser, 
  showNotification,
  getPesoEquivalente,
  lotesEtiquetados,
  setLotesEtiquetados,
  setDescuentosPendientes
}: any) => {
  const [selectedLoteId, setSelectedLoteId] = useState<string | null>(null);
  const [selectedCorteId, setSelectedCorteId] = useState<string | null>(null);
  const [corteAlmacenes, setCorteAlmacenes] = useState<Record<string, string>>({});
  
  // Finalization states
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [finalizeForm, setFinalizeForm] = useState({
    pesoBrutoTotal: '',
    almacenDestinoId: '',
    observaciones: ''
  });

  const [weighingMode, setWeighingMode] = useState<'BALANZA' | 'MANUAL'>('BALANZA');
  const [serialPort, setSerialPort] = useState<any>(null);
  const [currentWeight, setCurrentWeight] = useState<number>(0);
  const [isStable, setIsStable] = useState(false);
  const [isEditingFinalized, setIsEditingFinalized] = useState(false);
  const [isEditConfirmModalOpen, setIsEditConfirmModalOpen] = useState(false);
  const [anularModal, setAnularModal] = useState<{ isOpen: boolean, envase: any | null, motivo: string }>({ 
    isOpen: false, 
    envase: null, 
    motivo: '' 
  });
  const [editingPesoBarras, setEditingPesoBarras] = useState<string | null>(null);
  const [editingPesoDraft, setEditingPesoDraft] = useState('');
  const [manualWeight, setManualWeight] = useState<string>('');
  const [manualGrossWeight, setManualGrossWeight] = useState<string>('');
  const [manualUnits, setManualUnits] = useState<number>(1);
  const [isSerialSupported, setIsSerialSupported] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'IDLE' | 'CONNECTING' | 'CONNECTED' | 'ERROR'>('IDLE');
  const [baudRate, setBaudRate] = useState(9600);
  const [tara, setTara] = useState(0);

  // Search and selection
  const [searchTerm, setSearchTerm] = useState('');

  const barcodeRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!('serial' in navigator)) {
      setIsSerialSupported(false);
      setWeighingMode('MANUAL');
    }
  }, []);

  useEffect(() => {
    setIsEditingFinalized(false);
  }, [selectedLoteId]);

  const lotesDisponibles = useMemo(() => {
    const prod = lotesProduccion
      .filter((l: any) => l.estado === 'Finalizado' || l.estado === 'En Proceso')
      .map((l: any) => ({ ...l, tipo: 'produccion' }));
    const desp = lotesDespiece
      .filter((l: any) => {
        const estado = getLoteField(l, 'estado');
        return estado === 'Finalizado' || estado === 'En Proceso';
      })
      .map((l: any) => ({ 
        ...l, 
        tipo: 'despiece',
        numeroLote: getLoteField(l, 'numeroLote'),
        fechaElaboracion: getLoteField(l, 'fecha')
      }));
    return [...prod, ...desp].sort((a, b) => new Date(b.fechaElaboracion).getTime() - new Date(a.fechaElaboracion).getTime());
  }, [lotesProduccion, lotesDespiece]);

  const selectedLote = useMemo(() => {
    return lotesDisponibles.find(l => l.id === selectedLoteId);
  }, [selectedLoteId, lotesDisponibles]);

  const product = useMemo(() => {
    if (!selectedLote) return null;
    if (selectedLote.tipo === 'produccion') {
      return productos.find((p: any) => p.id === selectedLote.productoId);
    } else {
      // For despiece, it depends on the selected cut
      if (!selectedCorteId) return null;
      return productos.find((p: any) => p.id === selectedCorteId);
    }
  }, [selectedLote, selectedCorteId, productos]);

  const loteEtiquetado = useMemo(() => {
    if (!selectedLoteId) return null;
    // For despiece, we might want separate tracking per cut or combined? 
    // Usually combined per Lote, but referencing the specific product
    const key = selectedLote?.tipo === 'despiece' ? `${selectedLoteId}-${selectedCorteId}` : selectedLoteId;
    
    return lotesEtiquetados.find((l: any) => l.loteId === key) || {
      loteId: key,
      parentLoteId: selectedLoteId,
      loteNumero: selectedLote?.numeroLote,
      tipoLote: selectedLote?.tipo,
      productoId: product?.id,
      almacenId: selectedLote?.tipo === 'despiece' && selectedCorteId 
        ? (selectedLote.cortes?.find((c: any) => c.productoId === selectedCorteId)?.almacenDestinoId || '') 
        : '',
      envases: [],
      pesoTotalEtiquetado: 0,
      estado: 'en_proceso',
      mermaEmpaquetado: 0,
      corteId: selectedCorteId
    };
  }, [selectedLoteId, selectedCorteId, lotesEtiquetados, selectedLote, product]);

  const pesoEtiquetado = useMemo(() => {
    if (!loteEtiquetado) return 0;
    return loteEtiquetado.envases.filter((e: any) => {
      const isAnulado = e.anulado === true || e.anulado === 'true';
      return !isAnulado;
    }).reduce((sum: number, e: any) => sum + e.pesoNeto, 0);
  }, [loteEtiquetado]);

  const pesoTotalEstimado = useMemo(() => {
    if (!selectedLote) return 0;
    if (selectedLote.tipo === 'produccion') {
       return selectedLote.pesoNeto || selectedLote.cantidadEstimada || 0;
    } else {
       if (!selectedCorteId) return 0;
       const corte = selectedLote.cortes.find((c: any) => c.productoId === selectedCorteId);
       return corte ? (corte.cantidadReal || corte.cantidadEsperada || 0) : 0;
    }
  }, [selectedLote, selectedCorteId]);

  const isKgProduct = product?.unidadMedidaId === 'u1'; // Assuming u1 is kg

  const currentPackagingWeight = useMemo(() => {
    if (isKgProduct) {
      return weighingMode === 'BALANZA' ? currentWeight : (parseFloat(manualWeight) || 0);
    } else {
      return manualUnits * (product?.pesoNetoUnidad || 0);
    }
  }, [isKgProduct, weighingMode, currentWeight, manualWeight, manualUnits, product]);

  const nextEnvaseNumero = useMemo(() => {
    if (!loteEtiquetado) return 1;
    return loteEtiquetado.envases.length + 1;
  }, [loteEtiquetado]);

  const currentBarcodeValue = useMemo(() => {
    if (!selectedLote) return '';
    const code = selectedLote.numeroLote;
    
    if (selectedLote.tipo === 'despiece') {
       const prodCode = product?.codigo || '000';
       return `${code}-${prodCode}-${nextEnvaseNumero.toString().padStart(3, '0')}`;
    }
    
    const suffix = selectedCorteId ? `-${productos.find(p => p.id === selectedCorteId)?.codigo.slice(-3)}` : '';
    return `${code}${suffix}-${nextEnvaseNumero.toString().padStart(3, '0')}`;
  }, [selectedLote, product, nextEnvaseNumero, selectedCorteId, productos]);

  // Serial Port Logic
  const connectScale = async () => {
    try {
      setConnectionStatus('CONNECTING');
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none' });
      setSerialPort(port);
      setConnectionStatus('CONNECTED');
      showNotification('Balanza conectada', 'success');
      readFromPort(port);
    } catch (error) {
      console.error(error);
      setConnectionStatus('ERROR');
      showNotification('Error al conectar balanza', 'error');
    }
  };

  const readFromPort = async (port: any) => {
    const reader = port.readable.getReader();
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        buffer += text;
        if (buffer.includes('\n') || buffer.includes('\r')) {
          const lines = buffer.split(/[\r\n]+/);
          const lastLine = lines[lines.length - 2];
          if (lastLine) {
            const match = lastLine.match(/(\d+\.?\d*)/);
            if (match) {
              const weightValue = parseFloat(match[1]);
              setCurrentWeight(Math.max(0, weightValue - tara));
            }
          }
          buffer = lines[lines.length - 1];
        }
      }
    } catch (error) {
      console.error(error);
      setConnectionStatus('ERROR');
    } finally {
      reader.releaseLock();
    }
  };

  const handleTara = () => {
    setTara(weighingMode === 'BALANZA' ? currentWeight + tara : 0);
    showNotification('Tara aplicada', 'success');
  };

  // Stability detection
  useEffect(() => {
    if (weighingMode === 'BALANZA' && connectionStatus === 'CONNECTED') {
      const timer = setTimeout(() => setIsStable(true), 1500);
      return () => {
        setIsStable(false);
        clearTimeout(timer);
      };
    }
  }, [currentWeight, weighingMode, connectionStatus]);

  useEffect(() => {
    if (barcodeRef.current && currentBarcodeValue) {
      JsBarcode(barcodeRef.current, currentBarcodeValue, {
        format: "CODE128",
        width: 2,
        height: 60,
        displayValue: false,
        margin: 0
      });
    }
  }, [currentBarcodeValue]);

  const registerEnvase = (print: boolean) => {
    if (!selectedLoteId || currentPackagingWeight <= 0) return;
    if (selectedLote?.tipo === 'despiece' && !selectedCorteId) return;

    const newEnvase = {
      numero: nextEnvaseNumero,
      codigoBarras: currentBarcodeValue,
      pesoNeto: currentPackagingWeight,
      pesoBruto: parseFloat(manualGrossWeight) || null,
      fechaHora: new Date().toISOString(),
      usuario: currentUser.name,
      anulado: false
    };

    const updatedLoteEtiquetado = {
      ...loteEtiquetado,
      envases: [...loteEtiquetado.envases, { ...newEnvase, estado: 'en_stock' }],
      pesoTotalEtiquetado: pesoEtiquetado + currentPackagingWeight
    };

    const newLotesEtiquetados = lotesEtiquetados.filter((l: any) => l.loteId !== loteEtiquetado.loteId);
    setLotesEtiquetados([...newLotesEtiquetados, updatedLoteEtiquetado]);

    // Track movement if it's already finalized (editing mode) or if we want real-time stock
    if (selectedLote.estado === 'Finalizado') {
       const now = new Date().toISOString();
       const prodPT = productos.find((p: any) => p.id === updatedLoteEtiquetado.productoId);
       const unitPT = unidades.find((u: any) => u.id === prodPT?.unidadMedidaId)?.abreviatura || 'kg';
       const almId = selectedLote.tipo === 'despiece'
         ? (updatedLoteEtiquetado.almacenId || almacenes[0]?.id || '')
         : (selectedLote.almacenDestinoId || almacenes[0]?.id || '');
       
       const move: Movimiento = {
         id: `MOV-${Date.now()}-edit-add`,
         tipo: 'entrada',
         productoId: updatedLoteEtiquetado.productoId,
         almacenId: almId,
         cantidad: prodPT?.unidadMedidaId === 'u1' ? currentPackagingWeight : 1,
         unidad: unitPT,
         cantidadKg: currentPackagingWeight,
         motivo: `Nuevo envase (#${newEnvase.numero}) - Edición Lote ${selectedLote.numeroLote}`,
         loteNumero: selectedLote.tipo === 'despiece'
           ? `${selectedLote.numeroLote}-${Math.max(0, (selectedLote.cortes || []).findIndex((c: any) => c.productoId === updatedLoteEtiquetado.productoId)) + 1}`
           : selectedLote.numeroLote,
         fechaIngreso: safeFormat(new Date(), 'yyyy-MM-dd'),
         fechaVencimiento: selectedLote.fechaVencimiento,
         origen: selectedLote.tipo === 'despiece' ? 'despiece' : 'produccion',
         usuario: currentUser.name,
         fechaHora: now,
         anulado: false,
         referencia: selectedLote.numeroLote,
         observaciones: `Caja registrada durante edición de lote finalizado. Code: ${newEnvase.codigoBarras}`
       };
       setMovimientos([move, ...movimientos]);
    }

    if (print) {
      handlePrintLabel(newEnvase);
    }

    setManualWeight('');
    setManualGrossWeight('');
    setIsStable(false);
    showNotification('Envase registrado', 'success');
  };

  const handlePrintLabel = (envase?: any) => {
    const targetEnvase = envase || {
      numero: nextEnvaseNumero,
      codigoBarras: currentBarcodeValue,
      pesoNeto: currentPackagingWeight,
      fechaHora: new Date().toISOString()
    };

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const fechaElab = safeFormat(selectedLote?.fechaElaboracion, 'dd/MM/yyyy');
    const fechaVenc = safeFormat(selectedLote?.fechaVencimiento, 'dd/MM/yyyy');
    
    const nameStr = (product?.nombre || '').split(' - ').pop() || '';

    // Create a temporary canvas for the barcode
    const tempCanvas = document.createElement('canvas');
    JsBarcode(tempCanvas, targetEnvase.codigoBarras, {
      format: "CODE128",
      width: 2,
      height: 60,
      displayValue: false
    });
    const barcodeDataUrl = tempCanvas.toDataURL();

    printWindow.document.write(`
      <html>
        <head>
          <title>Etiqueta Alido</title>
          <style>
             @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            @page { size: 100mm 100mm; margin: 0; }
            body { margin: 0; padding: 5mm; font-family: 'Inter', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; }
            .label-container {
              width: 90mm;
              height: 90mm;
              border: 1px solid #000;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: space-between;
              padding: 4mm;
              box-sizing: border-box;
            }
            .logo { height: 10mm; margin-bottom: 2mm; }
            .product-name-container {
              width: 100%;
              height: 25mm;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 2mm;
              overflow: hidden;
            }
            .product-name { 
              font-size: 24pt; 
              font-weight: 900; 
              text-align: center; 
              text-transform: uppercase; 
              line-height: 1.1; 
              width: 100%;
              word-wrap: break-word;
            }
            .barcode-img { width: 70mm; height: 18mm; border-bottom: 1px solid #000; padding-bottom: 1mm; }
            .lote-num { font-size: 9pt; font-weight: 700; margin-top: 1mm; font-family: monospace; }
            .details-grid { width: 100%; display: grid; grid-template-columns: 1fr; gap: 1mm; font-size: 9pt; font-weight: 700; }
            .peso-neto { font-size: 18pt; font-weight: 900; border-top: 3px solid #000; padding-top: 2mm; margin-top: 1mm; text-align: center; }
            .storage { font-size: 8pt; color: #000; font-weight: 700; text-transform: uppercase; border-top: 1px solid #000; padding-top: 1mm; width: 100%; text-align: center; margin-top: 1mm; }
            .allergens { font-size: 8pt; font-weight: 900; background: #000; color: #fff; width: 100%; text-align: center; padding: 1.5mm 0; margin-top: 1mm; }
          </style>
        </head>
        <body>
          <div class="label-container">
            <div style="display: flex; flex-direction: column; align-items: center;">
              <img src="logo.png" class="logo" style="display: block;" onerror="this.style.display='none'" />
              <div style="font-size: 7pt; font-weight: 900; letter-spacing: 0.1em; opacity: 0.5;">ALIDO - GESTIÓN</div>
            </div>
            
            <div class="product-name-container">
              <div class="product-name" id="product-name">${nameStr}</div>
            </div>

            <div style="display: flex; flex-direction: column; align-items: center; width: 100%;">
              <img src="${barcodeDataUrl}" class="barcode-img" />
              <div class="lote-num">${targetEnvase.codigoBarras}</div>
            </div>

            <div class="details-grid">
              <div style="display: flex; justify-content: space-between;">
                <span>ELAB: ${fechaElab}</span>
                <span>VENC: ${fechaVenc}</span>
              </div>
              <div class="peso-neto">PESO NETO: ${displayNum(targetEnvase.pesoNeto, 3)} kg</div>
            </div>
            ${product?.condicionAlmacenamiento ? `<div class="storage">${product.condicionAlmacenamiento}</div>` : ''}
            ${product?.alergenos?.length > 0 ? `<div class="allergens uppercase">CONTIENE: ${product.alergenos.join(', ')}</div>` : ''}
          </div>
          <script>
            function adjustFontSize() {
              const el = document.getElementById('product-name');
              const container = el.parentElement;
              let size = 24;
              el.style.fontSize = size + 'pt';
              
              while ((el.scrollHeight > container.offsetHeight || el.scrollWidth > container.offsetWidth) && size > 8) {
                size -= 0.5;
                el.style.fontSize = size + 'pt';
              }
            }

            window.onload = function() {
              adjustFontSize();
              window.print();
              setTimeout(() => window.close(), 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      registerEnvase(true);
    }
  };

  const resolveLeIdForEnvase = (env: any): string | null => {
    if (!selectedLoteId || !selectedLote) return null;
    if (selectedLote.tipo === 'produccion') {
      const le = lotesEtiquetados.find((x: any) => x.loteId === selectedLoteId || x.loteId === selectedLote.numeroLote);
      return le?.loteId || null;
    }
    const match = lotesEtiquetados.find((x: any) =>
      x.parentLoteId === selectedLoteId &&
      (x.envases || []).some((ev: any) => ev.numero === env.numero && ev.codigoBarras === env.codigoBarras)
    );
    return match?.loteId || loteEtiquetado?.loteId || null;
  };

  const commitEnvasePesoEdit = (env: any, draft: string) => {
    const newKg = parseFloat(draft);
    if (!selectedLote || Number.isNaN(newKg) || newKg < 0) {
      setEditingPesoBarras(null);
      return;
    }
    const oldKg = parseFloat(env.pesoNeto) || 0;
    const delta = newKg - oldKg;
    if (Math.abs(delta) < 0.0001) {
      setEditingPesoBarras(null);
      return;
    }
    const leId = resolveLeIdForEnvase(env);
    if (!leId) {
      setEditingPesoBarras(null);
      return;
    }
    const now = new Date().toISOString();
    const targetLe = lotesEtiquetados.find((l: any) => l.loteId === leId);
    if (!targetLe) {
      setEditingPesoBarras(null);
      return;
    }
    const updatedEnvases = targetLe.envases.map((ev: any) =>
      ev.codigoBarras === env.codigoBarras && ev.numero === env.numero ? { ...ev, pesoNeto: newKg } : ev
    );
    const active = updatedEnvases.filter((ev: any) => !(ev.anulado === true || ev.anulado === 'true' || ev.estado === 'baja'));
    const pesoTotalEtiquetado = active.reduce((s: number, ev: any) => s + (parseFloat(ev.pesoNeto) || 0), 0);
    setLotesEtiquetados(lotesEtiquetados.map((l: any) =>
      l.loteId === leId ? { ...l, envases: updatedEnvases, pesoTotalEtiquetado } : l
    ));

    if (selectedLote.tipo === 'despiece') {
      const prodId = targetLe.productoId;
      setLotesDespiece(lotesDespiece.map((ld: any) => {
        if (ld.id !== selectedLoteId) return ld;
        const cortes = (ld.cortes || []).map((c: any) =>
          c.productoId === prodId
            ? { ...c, cantidadReal: pesoTotalEtiquetado, unidadesReales: active.length }
            : c
        );
        const totalCortesKg = cortes.reduce((s: number, c: any) => s + (parseFloat(c.cantidadReal) || 0), 0);
        const cantIng = parseFloat(ld.cantidadIngresada) || 0;
        const rendimientoReal = cantIng > 0 ? formatNum((totalCortesKg / cantIng) * 100, 1) : ld.rendimientoReal;
        return { ...ld, cortes, rendimientoReal, totalCortes: totalCortesKg };
      }));
    } else {
      const prodPT = productos.find((p: any) => p.id === targetLe.productoId);
      const usesUnits = prodPT?.unidadMedidaId !== 'u1';
      setLotesProduccion(lotesProduccion.map((lp: any) => {
        if (lp.id !== selectedLoteId) return lp;
        return {
          ...lp,
          pesoNeto: pesoTotalEtiquetado,
          unidadesReales: usesUnits ? active.length : lp.unidadesReales
        };
      }));
    }

    if (selectedLote.estado === 'Finalizado') {
      const prodPT = productos.find((p: any) => p.id === targetLe.productoId);
      const unitPT = unidades.find((u: any) => u.id === prodPT?.unidadMedidaId)?.abreviatura || 'kg';
      const almId = selectedLote.tipo === 'despiece'
        ? (targetLe.almacenId || selectedLote.cortes?.find((c: any) => c.productoId === targetLe.productoId)?.almacenDestinoId || almacenes[0]?.id)
        : (selectedLote.almacenDestinoId || almacenes[0]?.id);
      const loteNumMov = selectedLote.tipo === 'despiece'
        ? `${selectedLote.numeroLote}-${Math.max(0, (selectedLote.cortes || []).findIndex((c: any) => c.productoId === targetLe.productoId)) + 1}`
        : selectedLote.numeroLote;
      const tipoMov = delta > 0 ? 'entrada' : 'salida';
      const absKg = Math.abs(delta);
      const movUsesUnits = prodPT?.unidadMedidaId !== 'u1';
      const cantMov = movUsesUnits
        ? Math.max(1, Math.round(absKg / (prodPT?.pesoNetoUnidad || 1)))
        : absKg;
      const move: Movimiento = {
        id: `MOV-${Date.now()}-peso-adj`,
        tipo: tipoMov,
        productoId: targetLe.productoId,
        almacenId: almId,
        cantidad: cantMov,
        unidad: unitPT,
        cantidadKg: absKg,
        motivo: `Ajuste peso envase (#${env.numero}) — Lote ${selectedLote.numeroLote}`,
        loteNumero: loteNumMov,
        fechaIngreso: safeFormat(new Date(), 'yyyy-MM-dd'),
        fechaVencimiento: selectedLote.fechaVencimiento,
        origen: selectedLote.tipo === 'despiece' ? 'despiece' : 'produccion',
        usuario: currentUser.name,
        fechaHora: now,
        anulado: false,
        referencia: selectedLote.numeroLote,
        observaciones: `Peso anterior ${oldKg.toFixed(3)} kg → ${newKg.toFixed(3)} kg`
      };
      setMovimientos([move, ...movimientos]);
    }

    setEditingPesoBarras(null);
    showNotification('Peso del envase actualizado', 'success');
  };

  const finalizeEtiquetado = () => {
    if (!loteEtiquetado || loteEtiquetado.envases.length === 0) return;
    if (selectedLote?.tipo === 'despiece') {
      showNotification('Finalice el lote de despiece en Producción → Lotes de Despiece (botón «Finalizar lote de despiece»).', 'info');
      return;
    }
    setIsFinalizeModalOpen(true);
  };

  const handleConfirmFinalize = () => {
    if (selectedLote?.tipo === 'despiece') {
      showNotification('La finalización del despiece solo se realiza en Lotes de Despiece.', 'error');
      setIsFinalizeModalOpen(false);
      return;
    }

    if (selectedLote?.tipo !== 'produccion') {
      setIsFinalizeModalOpen(false);
      return;
    }

    if (!finalizeForm.almacenDestinoId) {
      showNotification('Debe seleccionar un almacén de destino', 'error');
      return;
    }

    const now = new Date().toISOString();
    const addedMovimientos: any[] = [];
    
    {
      const lote = lotesProduccion.find((l: any) => l.id === selectedLoteId);
      if (!lote) {
        setIsFinalizeModalOpen(false);
        return;
      }

      const pesoNetoTotal = pesoEtiquetado;
      const totalInsumosKg = lote.insumos.reduce((sum: number, ins: any) => sum + (ins.cantidadReal * getPesoEquivalente(ins.materiaPrimaId)), 0);
      const rendimiento = totalInsumosKg > 0 ? (pesoNetoTotal / totalInsumosKg) * 100 : 0;
      const mermaKg = totalInsumosKg - pesoNetoTotal;
      const mermaPorcentaje = 100 - rendimiento;

      const receta = recetas.find((r: any) => r.productoTerminadoId === lote.productoId);
      const desvioRendimiento = rendimiento - (receta?.rendimientoEsperado || 100);

      lote.insumos.forEach((ins: any) => {
        let remainingToDeduct = ins.cantidadReal;
        const availableLots = [...lotesStock]
          .filter((ls: any) => ls.productoId === ins.materiaPrimaId)
          .sort((a, b) => new Date(a.fechaVencimiento).getTime() - new Date(b.fechaVencimiento).getTime());

        availableLots.forEach((ls: any) => {
          if (remainingToDeduct <= 0) return;
          const deduct = Math.min(ls.cantidad, remainingToDeduct);
          remainingToDeduct -= deduct;

          const prod = productos.find((p: any) => p.id === ins.materiaPrimaId);
          const unit = unidades.find((u: any) => u.id === prod?.unidadMedidaId)?.abreviatura || 'kg';

          addedMovimientos.push({
            id: `MOV-${Date.now()}-${Math.random()}`,
            tipo: 'salida',
            productoId: ins.materiaPrimaId,
            almacenId: ls.almacenId,
            cantidad: deduct,
            unidad: unit,
            cantidadKg: deduct * getPesoEquivalente(ins.materiaPrimaId),
            motivo: `Consumo Producción Lote ${lote.numeroLote}`,
            loteNumero: ls.numeroLote,
            fechaIngreso: safeFormat(new Date(), 'yyyy-MM-dd'),
            fechaVencimiento: ls.fechaVencimiento,
            origen: 'produccion',
            usuario: currentUser.name,
            fechaHora: now,
            anulado: false,
            referencia: lote.numeroLote
          });
        });

        if (remainingToDeduct > 0) {
           const stockAvailable = lotesStock.filter((ls: any) => ls.productoId === ins.materiaPrimaId).reduce((s: number, l: any) => s + l.cantidad, 0);
           setDescuentosPendientes((prev: any) => [...prev, {
              id: `dp-${Date.now()}-${Math.random()}`,
              loteId: lote.id,
              loteNumero: lote.numeroLote,
              productoId: ins.materiaPrimaId,
              cantidadSolicitada: ins.cantidadReal,
              cantidadDisponible: stockAvailable,
              pendiente: remainingToDeduct,
              fecha: now
           }]);
        }
      });

      const prodPT = productos.find((p: any) => p.id === lote.productoId);
      const unitPT = unidades.find((u: any) => u.id === prodPT?.unidadMedidaId)?.abreviatura || 'kg';
      
      addedMovimientos.push({
        id: `MOV-${Date.now()}-pt`,
        tipo: 'entrada',
        productoId: lote.productoId,
        almacenId: finalizeForm.almacenDestinoId,
        cantidad: prodPT?.unidadMedidaId === 'u1' ? pesoNetoTotal : (loteEtiquetado.envases.length),
        unidad: unitPT,
        cantidadKg: pesoNetoTotal,
        motivo: 'Producción',
        loteNumero: lote.numeroLote,
        fechaIngreso: safeFormat(new Date(), 'yyyy-MM-dd'),
        fechaVencimiento: lote.fechaVencimiento,
        origen: 'produccion',
        usuario: currentUser.name,
        fechaHora: now,
        anulado: false,
        referencia: lote.numeroLote
      });

      const updatedLote = {
        ...lote,
        estado: 'Finalizado',
        pesoNeto: pesoNetoTotal,
        pesoBruto: parseFloat(finalizeForm.pesoBrutoTotal) || 0,
        unidadesReales: loteEtiquetado.envases.length,
        rendimientoReal: rendimiento,
        mermaKg: mermaKg,
        mermaPorcentaje: mermaPorcentaje,
        desvioRendimiento: desvioRendimiento,
        almacenDestinoId: finalizeForm.almacenDestinoId,
        observaciones: `${lote.observaciones || ''}\n[Cierre Etiquetado]: ${finalizeForm.observaciones}`,
        fechaFinalizacion: now
      };

      setLotesProduccion(lotesProduccion.map((l: any) => l.id === lote.id ? updatedLote : l));
      
      const histEntry = {
        id: `lph-${Date.now()}`,
        loteId: lote.id,
        fecha: now,
        usuarioId: currentUser.id,
        accion: 'Finalización Etiquetado',
        detalle: `Lote finalizado desde estación de etiquetas. Rendimiento: ${rendimiento.toFixed(1)}%. Stock ingresado a ${almacenes.find((a: any) => a.id === finalizeForm.almacenDestinoId)?.nombre}`
      };
      setLotesHistorial([histEntry, ...lotesHistorial]);
    }

    setMovimientos([...addedMovimientos, ...movimientos]);

    setIsFinalizeModalOpen(false);
    setSelectedLoteId(null);
    setSelectedCorteId(null);
    setFinalizeForm({ pesoBrutoTotal: '', almacenDestinoId: '', observaciones: '' });
    
    showNotification(`Lote ${selectedLote.numeroLote} finalizado correctamente.`, 'success');
  };

  const [historySearchTerm, setHistorySearchTerm] = useState('');

  const lotesEtiquetadosHistory = useMemo(() => {
    return lotesEtiquetados.filter((le: any) => {
      const p = productos.find(prod => prod.id === le.productoId);
      const loteObj = lotesDisponibles.find(lf => lf.id === le.parentLoteId || lf.id === le.loteId);
      const name = p?.nombre || '';
      const num = loteObj?.numeroLote || '';
      return name.toLowerCase().includes(historySearchTerm.toLowerCase()) || 
             num.toLowerCase().includes(historySearchTerm.toLowerCase());
    });
  }, [lotesEtiquetados, historySearchTerm, productos, lotesDisponibles]);

  const envasesParaMostrar = useMemo(() => {
    if (!selectedLote) return [];
    if (selectedLote.tipo === 'produccion') return loteEtiquetado?.envases.slice().reverse() || [];
    
    // For despiece, combine all cuts of this lot
    const allCutsLabels = lotesEtiquetados.filter((le: any) => le.parentLoteId === selectedLoteId);
    let allEnvases: any[] = [];
    allCutsLabels.forEach(le => {
      const cutProd = productos.find(p => p.id === le.productoId);
      const enrichedEnvases = le.envases.map((e: any) => ({ ...e, corteNombre: cutProd?.nombre || 'Desconocido' }));
      allEnvases = [...allEnvases, ...enrichedEnvases];
    });
    // Sort by date/time
    return allEnvases.sort((a, b) => new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime());
  }, [selectedLote, selectedLoteId, loteEtiquetado, lotesEtiquetados, productos]);

  const totalPesoLote = useMemo(() => {
    if (!selectedLoteId) return 0;
    if (selectedLote?.tipo === 'produccion') return pesoEtiquetado;
    const allCutsLabels = lotesEtiquetados.filter((le: any) => le.parentLoteId === selectedLoteId);
    return allCutsLabels.reduce((loteSum, le) => {
      return loteSum + le.envases.filter((e: any) => !(e.anulado === true || e.anulado === 'true')).reduce((s: number, e: any) => s + e.pesoNeto, 0);
    }, 0);
  }, [selectedLote, selectedLoteId, lotesEtiquetados, pesoEtiquetado]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-black text-sleek-dark uppercase tracking-tighter">Estación de Etiquetado</h2>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              Producción / <span className="text-sleek-accent">Etiquetas</span>
              <button 
                onClick={() => showNotification('Configuración: Zebra GC420, 100x100mm, sin márgenes', 'success')}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 transition-colors ml-2"
              >
                <Settings className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
              <input 
                type="text"
                placeholder="Buscar historial..."
                value={historySearchTerm}
                onChange={(e) => setHistorySearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded text-[10px] font-bold uppercase outline-none focus:ring-2 focus:ring-sleek-accent transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {historySearchTerm && (
        <Card className="p-6 border-2 border-sleek-accent animate-in slide-in-from-top-4">
          <h3 className="text-[10px] font-black text-sleek-accent uppercase tracking-widest mb-4">Resultados en Historial de Etiquetado</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {lotesEtiquetadosHistory.map((le: any) => {
               const p = productos.find(prod => prod.id === le.productoId);
               const loteObj = lotesDisponibles.find(lf => lf.id === le.parentLoteId || lf.id === le.loteId);
               return (
                 <div key={le.loteId} className="p-4 border border-slate-100 rounded-lg hover:border-sleek-accent transition-all bg-white flex flex-col gap-3 shadow-sm">
                   <div className="flex justify-between">
                     <span className="text-[10px] font-black text-sleek-dark uppercase font-mono">{loteObj?.numeroLote}</span>
                     <Badge variant={le.estado === 'finalizado' ? 'success' : 'warning'}>{le.estado}</Badge>
                   </div>
                   <p className="text-xs font-bold text-slate-600 uppercase truncate">{p?.nombre}</p>
                   <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                     <span>{le.envases.length} Envases</span>
                     <span>{le.pesoTotalEtiquetado.toFixed(1)} kg</span>
                   </div>
                   <button 
                     onClick={() => {
                        setSelectedLoteId(le.parentLoteId || le.loteId);
                        if (le.corteId) setSelectedCorteId(le.corteId);
                        setHistorySearchTerm('');
                     }} 
                     className="w-full py-2 bg-slate-50 hover:bg-sleek-accent hover:text-white transition-all rounded text-[9px] font-black uppercase tracking-widest"
                   >
                     Seleccionar / Reimprimir
                   </button>
                 </div>
               );
            })}
            {lotesEtiquetadosHistory.length === 0 && (
              <p className="col-span-full text-center text-slate-400 py-8 text-xs font-bold uppercase">No se encontraron lotes históricos</p>
            )}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Step 1: Selection & Lote Info */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="p-6">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Paso 1 — Seleccionar Lote (En Proceso / Finalizado)</label>
            <div className="relative mb-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text"
                placeholder="N° Lote o Producto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none transition-all font-bold placeholder:font-normal placeholder:text-slate-300"
              />
            </div>
            
            <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {lotesDisponibles.filter(l => {
                const p = productos.find(prod => prod.id === (l.productoId || l.materiaPrimaId));
                return l.numeroLote.toLowerCase().includes(searchTerm.toLowerCase()) || 
                       p?.nombre.toLowerCase().includes(searchTerm.toLowerCase());
              }).map(lote => {
                const p = productos.find(prod => prod.id === (lote.productoId || lote.materiaPrimaId));
                const isSelected = selectedLoteId === lote.id;
                
                return (
                  <button
                    key={lote.id}
                    onClick={() => {
                      setSelectedLoteId(lote.id);
                      setSelectedCorteId(null);
                    }}
                    className={cn(
                      "w-full text-left p-4 rounded-xl border transition-all flex flex-col gap-2 relative overflow-hidden group",
                      isSelected ? "border-sleek-accent bg-sleek-accent/5 ring-1 ring-sleek-accent" : "border-slate-100 hover:border-slate-300 bg-white shadow-sm"
                    )}
                  >
                    {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-sleek-accent"></div>}
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", lote.estado === 'En Proceso' ? "bg-blue-500 animate-pulse" : "bg-emerald-500")}></div>
                        <span className="text-[10px] font-black text-slate-400 uppercase font-mono">{lote.numeroLote}</span>
                      </div>
                      <span className="text-[9px] font-bold text-slate-300 uppercase">{safeFormat(lote.fechaElaboracion, 'dd/MM/yyyy')}</span>
                    </div>
                    <div>
                      <p className={cn("text-xs font-black uppercase tracking-tight", isSelected ? "text-sleek-dark" : "text-slate-600")}>
                        {p?.nombre}
                      </p>
                      <p className="text-[9px] font-bold text-slate-300 uppercase mt-1">
                        Est: {displayNum(lote.pesoNeto || lote.cantidadEstimada || lote.cantidadIngresada || 0, 1)} kg 
                        {lote.tipo === 'despiece' && <span className="ml-2 text-sleek-accent">| DESPIECE</span>}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {selectedLote && selectedLote.tipo === 'despiece' && (
            <Card className="p-6 animate-in slide-in-from-top-2 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Paso 1.1 — Seleccionar Corte para Etiquetar</label>
                <div className="grid grid-cols-1 gap-2">
                  {selectedLote.cortes.map((c: any) => {
                    const cutProd = productos.find(p => p.id === c.productoId);
                    const isCutSelected = selectedCorteId === c.productoId;
                    const leKey = `${selectedLoteId}-${c.productoId}`;
                    const le = lotesEtiquetados.find(item => item.loteId === leKey);
                    const progress = le ? (le.pesoTotalEtiquetado / (c.cantidadReal || c.cantidadEsperada || 1)) * 100 : 0;

                    return (
                      <button
                        key={c.productoId}
                        onClick={() => setSelectedCorteId(c.productoId)}
                        className={cn(
                          "w-full text-left p-3 rounded-lg border transition-all flex flex-col gap-1",
                          isCutSelected ? "border-sleek-accent bg-sleek-accent/5 ring-1 ring-sleek-accent" : "border-slate-100 hover:border-slate-300 bg-slate-50/50"
                        )}
                      >
                        <div className="flex justify-between items-center text-[10px] font-black">
                          <span className={isCutSelected ? "text-sleek-accent" : "text-slate-600"}>{cutProd?.nombre}</span>
                          <span className="text-slate-400">{displayNum(c.cantidadReal || c.cantidadEsperada, 1)} kg</span>
                        </div>
                        <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden mt-1">
                          <div className="bg-sleek-accent h-full transition-all" style={{ width: `${Math.min(100, progress)}%` }}></div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedCorteId && (
                <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Almacén destino</label>
                  {(() => {
                    const corte = selectedLote?.cortes?.find((c: any) => c.productoId === selectedCorteId);
                    const alm = almacenes.find((a: any) => a.id === corte?.almacenDestinoId);
                    return alm ? (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-[10px] font-bold text-emerald-700 uppercase">
                        {alm.nombre}
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[10px] font-bold text-amber-700">
                        ⚠ Sin almacén asignado. Asignar desde <span className="underline">Lotes de Despiece → Editar Lote</span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </Card>
          )}

          {selectedLote && (selectedLote.tipo === 'produccion' || selectedCorteId) && (
            <Card className="p-6 space-y-4 animate-in slide-in-from-left-4 duration-500">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-4">Detalles del Lote / Producto</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">Carga Actual</p>
                  <p className="text-sm font-black text-sleek-dark uppercase truncate">{product?.nombre}</p>
                </div>
                <div>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">Vencimiento</p>
                  <p className="text-sm font-black text-sleek-dark">{safeFormat(selectedLote.fechaVencimiento, 'dd/MM/yyyy')}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[11px]">
                  <span className="font-bold text-slate-400 uppercase">Progreso Etiquetado</span>
                  <span className="font-black text-sleek-dark">{displayNum(pesoEtiquetado, 3)} / {displayNum(pesoTotalEstimado, 3)} kg</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 border border-slate-200 overflow-hidden shadow-inner">
                  <div 
                    className="h-full bg-sleek-accent transition-all duration-500 relative" 
                    style={{ width: `${Math.min(100, (pesoEtiquetado / pesoTotalEstimado) * 100)}%` }}
                  >
                    <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-1">
                   <p className="text-[8px] font-black text-slate-300 uppercase">
                     {loteEtiquetado?.envases.length || 0} ENVASES REGISTRADOS
                   </p>
                   <p className={cn("text-[10px] font-black uppercase", (pesoTotalEstimado - pesoEtiquetado) < 0 ? "text-sleek-danger" : "text-slate-400")}>
                     { (pesoTotalEstimado - pesoEtiquetado) < 0 ? 'Exceso: ' : 'Restante: ' } {displayNum(Math.abs(pesoTotalEstimado - pesoEtiquetado), 3)} kg
                   </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {product?.condicionAlmacenamiento && <Badge variant="info" className="text-[8px]">{product.condicionAlmacenamiento}</Badge>}
                {product?.alergenos?.map((a: string) => (
                  <span key={a}><Badge variant="danger" className="text-[8px]">CONTIENE: {a}</Badge></span>
                ))}
              </div>

              <div className="pt-4 flex flex-col gap-2 border-t border-slate-100">
                {selectedLote.estado === 'Finalizado' && !isEditingFinalized ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-100 flex items-center gap-3">
                      <Lock className="w-4 h-4 text-amber-500" />
                      <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Lote ya finalizado</span>
                    </div>
                    <button 
                      onClick={() => setIsEditConfirmModalOpen(true)}
                      className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2"
                    >
                      <Edit2 className="w-4 h-4" /> Editar Lote
                    </button>
                  </div>
                ) : (
                  <>
                    {isEditingFinalized && (
                       <div className="p-3 bg-orange-50 rounded-lg border border-orange-200 flex items-center gap-3 mb-2">
                         <Edit3 className="w-4 h-4 text-orange-500" />
                         <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest">Editando Lote Finalizado</span>
                       </div>
                    )}
                    {selectedLote.tipo === 'despiece' && !isEditingFinalized ? (
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
                        <p className="text-[10px] font-bold text-slate-600 leading-relaxed uppercase tracking-wide">
                          El cierre y los movimientos de stock del despiece se registran en <span className="text-sleek-accent font-black">Lotes de Despiece</span> con el botón «Finalizar lote de despiece».
                        </p>
                      </div>
                    ) : (
                      <button 
                        onClick={isEditingFinalized ? () => {
                          const activeEnvases = loteEtiquetado.envases.filter((e: any) => {
                            const isAnulado = e.anulado === true || e.anulado === 'true';
                            return e.estado === 'en_stock' && !isAnulado;
                          });
                          const totalPeso = activeEnvases.reduce((sum: number, e: any) => sum + e.pesoNeto, 0);
                          const totalUnits = activeEnvases.length;
                          
                          if (selectedLote.tipo === 'produccion') {
                            const totalInsumosKg = selectedLote.insumos.reduce((sum: number, ins: any) => sum + (ins.cantidadReal * getPesoEquivalente(ins.materiaPrimaId)), 0);
                            const rendimiento = totalInsumosKg > 0 ? (totalPeso / totalInsumosKg) * 100 : 0;
                            
                            const updatedLote = {
                              ...selectedLote,
                              pesoNeto: totalPeso,
                              unidadesReales: totalUnits,
                              rendimientoReal: rendimiento,
                              mermaKg: totalInsumosKg - totalPeso,
                              mermaPorcentaje: 100 - rendimiento,
                              desvioRendimiento: rendimiento - (recetas.find((r: any) => r.productoTerminadoId === selectedLote.productoId)?.rendimientoEsperado || 100)
                            };
                            setLotesProduccion(lotesProduccion.map((l: any) => l.id === selectedLote.id ? updatedLote : l));
                          }
                          
                          setIsEditingFinalized(false);
                          showNotification('Edición guardada y cerrada', 'success');
                        } : finalizeEtiquetado}
                        disabled={loteEtiquetado?.envases.filter((e: any) => !(e.anulado === true || e.anulado === 'true')).length === 0}
                        className={cn(
                          "w-full py-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all shadow-lg",
                          (loteEtiquetado?.envases.filter((e: any) => !(e.anulado === true || e.anulado === 'true')).length > 0) ? "bg-sleek-dark text-white hover:bg-slate-800" : "bg-slate-100 text-slate-300 cursor-not-allowed"
                        )}
                      >
                        {isEditingFinalized ? 'Guardar y Cerrar Edición' : 'Finalizar Etiquetado'}
                      </button>
                    )}
                  </>
                )}
                {selectedLote.estado === 'En Proceso' && (
                  <p className="text-[8px] text-center text-slate-400 font-bold uppercase">
                    {selectedLote.tipo === 'despiece'
                      ? 'Nota: Finalice el lote en Lotes de Despiece para aplicar movimientos de inventario.'
                      : 'Nota: Al finalizar el etiquetado total, el lote podrá ser cerrado definitivamente.'}
                  </p>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Step 2: Weighing Station */}
        {selectedLote ? (
          <div className="lg:col-span-2 space-y-8 animate-in slide-in-from-right-4 duration-500">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card className="p-0 overflow-hidden flex flex-col">
              <div className="p-6 bg-sleek-dark text-white flex justify-between items-center">
                <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                  <MonitorSmartphone className="w-4 h-4 ml-[-4px]" /> Estación de Pesaje
                </h3>
                <div className="flex gap-2">
                  {isSerialSupported && (
                    <button
                      onClick={() => setWeighingMode(weighingMode === 'BALANZA' ? 'MANUAL' : 'BALANZA')}
                      className={cn(
                        "px-3 py-1 rounded text-[9px] font-bold uppercase transition-all",
                        weighingMode === 'BALANZA' ? "bg-sleek-accent text-white" : "bg-white/10 text-white/60"
                      )}
                    >
                      {weighingMode}
                    </button>
                  )}
                </div>
              </div>

              <div className="p-8 flex-1 flex flex-col justify-center items-center gap-8 min-h-[400px]">
                <div className="text-center space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Peso Neto Actual</p>
                  <div className="flex items-baseline justify-center gap-4">
                    <span className={cn(
                      "text-8xl font-black tracking-tighter tabular-nums transition-colors",
                      isStable ? "text-sleek-dark" : "text-slate-300"
                    )}>
                      {currentPackagingWeight.toFixed(3)}
                    </span>
                    <span className="text-4xl font-black text-slate-300 tracking-tighter">kg</span>
                  </div>
                  {weighingMode === 'BALANZA' && (
                    <div className="flex items-center justify-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", isStable ? "bg-emerald-500" : "bg-rose-500 animate-pulse")}></div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {isStable ? 'Estable' : 'Capturando...'}
                      </span>
                    </div>
                  )}
                </div>

                {weighingMode === 'BALANZA' ? (
                  <div className="w-full space-y-6">
                    {connectionStatus !== 'CONNECTED' ? (
                      <div className="text-center space-y-6">
                        <div className="inline-flex p-6 rounded-full bg-slate-50 border border-slate-100">
                          <WifiOff className="w-12 h-12 text-slate-200" />
                        </div>
                        <div className="space-y-4">
                           <div className="flex justify-center gap-2">
                              {[2400, 4800, 9600, 19200, 38400, 57600, 115200].map(rate => (
                                <button
                                  key={rate}
                                  onClick={() => setBaudRate(rate)}
                                  className={cn(
                                    "px-2 py-1 rounded text-[9px] font-black",
                                    baudRate === rate ? "bg-sleek-dark text-white" : "bg-slate-100 text-slate-400"
                                  )}
                                >
                                  {rate}
                                </button>
                              ))}
                           </div>
                           <button 
                            onClick={connectScale}
                            className="bg-sleek-dark text-white px-8 py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-3 mx-auto shadow-xl"
                          >
                            <Scale className="w-5 h-5" /> {connectionStatus === 'CONNECTING' ? 'Conectando...' : 'Conectar Balanza'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-4">
                        <button 
                          onClick={handleTara}
                          className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-xs uppercase tracking-widest rounded-xl transition-all"
                        >
                          Poner a Cero (Tara)
                        </button>
                        <button 
                          onClick={() => setSerialPort(null)}
                          className="p-4 text-slate-300 hover:text-rose-500 transition-all"
                          title="Desconectar Balanza"
                        >
                          <WifiOff className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                    {isKgProduct ? (
                      <>
                        <div>
                          <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Peso Neto (kg)</label>
                          <input 
                            type="number" 
                            step="0.001"
                            value={manualWeight}
                            disabled={selectedLote?.estado === 'Finalizado' && !isEditingFinalized}
                            onChange={e => setManualWeight(e.target.value)}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            placeholder="0.000"
                            className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-xl text-2xl font-black text-sleek-dark focus:outline-none focus:border-sleek-accent placeholder:text-slate-200 tabular-nums disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Peso Bruto (Opc.)</label>
                          <input 
                            type="number" 
                            step="0.001"
                            value={manualGrossWeight}
                            disabled={selectedLote?.estado === 'Finalizado' && !isEditingFinalized}
                            onChange={e => setManualGrossWeight(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="0.000"
                            className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-xl text-2xl font-black text-sleek-dark focus:outline-none focus:border-sleek-accent placeholder:text-slate-200 tabular-nums disabled:opacity-50"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="col-span-2">
                        <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Cant. Unidades (x {product?.pesoNetoUnidad || 0}kg)</label>
                        <div className="flex items-center gap-4">
                           <button 
                            onClick={() => setManualUnits(Math.max(1, manualUnits - 1))}
                            disabled={selectedLote?.estado === 'Finalizado' && !isEditingFinalized}
                            className="p-4 bg-slate-100 rounded-xl text-slate-600 disabled:opacity-50"
                           >
                            <Minus className="w-6 h-6" />
                           </button>
                           <input 
                             type="number"
                             value={manualUnits}
                             disabled={selectedLote?.estado === 'Finalizado' && !isEditingFinalized}
                             onChange={e => setManualUnits(parseInt(e.target.value) || 1)}
                             className="flex-1 text-center text-4xl font-black bg-slate-50 border-2 border-slate-100 py-3 rounded-xl focus:border-sleek-accent outline-none disabled:opacity-50"
                           />
                           <button 
                            onClick={() => setManualUnits(manualUnits + 1)}
                            disabled={selectedLote?.estado === 'Finalizado' && !isEditingFinalized}
                            className="p-4 bg-slate-100 rounded-xl text-slate-600 disabled:opacity-50"
                           >
                            <Plus className="w-6 h-6" />
                           </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>

            <div className="flex flex-col gap-6">
              <Card className="p-8 space-y-8 flex-1 flex flex-col items-center justify-center">
                <div className="text-center space-y-2">
                   <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Vista Previa Etiqueta</h3>
                   <div className="bg-slate-50 p-2 rounded border border-slate-100 mt-4">
                      <canvas ref={barcodeRef} className="max-w-full h-auto"></canvas>
                      <p className="text-[10px] font-bold text-sleek-dark mt-2 font-mono">{currentBarcodeValue}</p>
                   </div>
                </div>

                <div className="w-full space-y-4">
                   <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-4 items-start">
                     <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                     <p className="text-[10px] font-bold text-amber-700 leading-relaxed uppercase">
                        Verifique que el sustrato sea compatible con la impresora Zebra térmica directa. <br/>
                        <span className="font-black">Impresión en red (ZPL) Próximamente.</span>
                     </p>
                   </div>

                   <div className="grid grid-cols-1 gap-4">
                        <button 
                          onClick={() => registerEnvase(false)}
                          disabled={!selectedLoteId || currentPackagingWeight <= 0 || (selectedLote?.estado === 'Finalizado' && !isEditingFinalized)}
                          className={cn(
                            "w-full py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all",
                            (!selectedLoteId || currentPackagingWeight <= 0 || (selectedLote?.estado === 'Finalizado' && !isEditingFinalized)) 
                              ? "bg-slate-100 text-slate-300 cursor-not-allowed" 
                              : "bg-sleek-dark text-white hover:bg-slate-800"
                          )}
                        >
                          Registrar Sin Imprimir
                        </button>
                        <button 
                          onClick={() => registerEnvase(true)}
                          disabled={!selectedLoteId || currentPackagingWeight <= 0 || (selectedLote?.estado === 'Finalizado' && !isEditingFinalized)}
                          className={cn(
                            "w-full py-6 rounded-xl font-black text-sm uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-xl",
                            (!selectedLoteId || currentPackagingWeight <= 0 || (selectedLote?.estado === 'Finalizado' && !isEditingFinalized)) 
                              ? "bg-slate-100 text-slate-300 cursor-not-allowed" 
                              : "bg-sleek-accent text-white hover:bg-sleek-accent/90"
                          )}
                        >
                          <Printer className="w-6 h-6" /> Registrar e Imprimir
                        </button>
                   </div>
                </div>
              </Card>

              <Card className="p-6 bg-slate-900 text-white">
                 <div className="flex justify-between items-center mb-6">
                    <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Último Registrado</h4>
                    <span className="p-1 bg-white/10 rounded cursor-pointer hover:bg-white/20" onClick={() => handlePrintLabel(loteEtiquetado?.envases[loteEtiquetado?.envases.length - 1])}>
                      <Printer className="w-3 h-3 text-white/60" />
                    </span>
                 </div>
                 {loteEtiquetado?.envases.length > 0 ? (
                    <div className="space-y-4">
                       <div className="flex justify-between items-end">
                          <div>
                             <p className="text-xl font-black tabular-nums">{loteEtiquetado.envases[loteEtiquetado.envases.length - 1].pesoNeto.toFixed(3)} kg</p>
                             <p className="text-[9px] font-bold text-white/40 uppercase font-mono">{loteEtiquetado.envases[loteEtiquetado.envases.length - 1].codigoBarras}</p>
                          </div>
                          <p className="text-[9px] font-bold text-sleek-accent uppercase">Envase #{loteEtiquetado.envases[loteEtiquetado.envases.length - 1].numero}</p>
                       </div>
                    </div>
                 ) : (
                    <p className="text-[10px] font-bold text-white/20 uppercase italic text-center py-4">Sin envases registrados</p>
                 )}
              </Card>
            </div>
          </div>

        {/* Detailed Log */}
          <Card className="p-0 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
               <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                 <History className="w-4 h-4" /> Registro de Envases en Sesión
               </h3>
               <div className="flex gap-4 items-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">
                    Total Lote: <span className="text-sleek-accent">{selectedLote?.tipo === 'despiece' ? envasesParaMostrar.filter(e => !e.anulado).length : loteEtiquetado?.envases.filter((e: any) => !e.anulado).length || 0}</span> Envases | 
                    <span className="text-sleek-accent"> {totalPesoLote.toFixed(2)}</span> kg
                  </p>
               </div>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 sticky top-0 border-b border-slate-100">
                  <tr>
                    <th className="px-8 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Nº</th>
                    {selectedLote?.tipo === 'despiece' && <th className="px-8 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Corte</th>}
                    <th className="px-8 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Código</th>
                    <th className="px-8 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Peso Neto</th>
                    <th className="px-8 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Hora</th>
                    <th className="px-8 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {envasesParaMostrar.map((e: any, idx: number) => (
                    <tr key={idx} className={cn("transition-colors", e.anulado ? "bg-rose-50/30 opacity-60" : "hover:bg-slate-50/30")}>
                      <td className="px-8 py-3 text-[10px] font-black text-slate-400">#{e.numero}</td>
                      {selectedLote?.tipo === 'despiece' && (
                        <td className="px-8 py-3 text-[10px] font-bold text-sleek-dark uppercase truncate max-w-[120px]">
                           {e.corteNombre}
                        </td>
                      )}
                      <td className="px-8 py-3 font-mono text-[10px] font-bold text-sleek-dark lowercase">{e.codigoBarras}</td>
                      <td className="px-8 py-3">
                        {editingPesoBarras === e.codigoBarras ? (
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            autoFocus
                            value={editingPesoDraft}
                            onChange={(ev) => setEditingPesoDraft(ev.target.value)}
                            onBlur={() => commitEnvasePesoEdit(e, editingPesoDraft)}
                            onKeyDown={(ev) => {
                              if (ev.key === 'Enter') {
                                (ev.target as HTMLInputElement).blur();
                              }
                              if (ev.key === 'Escape') {
                                setEditingPesoBarras(null);
                              }
                            }}
                            className="w-24 px-2 py-1 text-xs font-black border border-sleek-accent rounded"
                          />
                        ) : (
                          <button
                            type="button"
                            disabled={e.anulado === true || e.anulado === 'true' || e.estado === 'baja'}
                            onClick={() => {
                              setEditingPesoBarras(e.codigoBarras);
                              setEditingPesoDraft(String(e.pesoNeto ?? ''));
                            }}
                            className="text-xs font-black text-sleek-dark hover:text-sleek-accent disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {e.pesoNeto.toFixed(3)} kg
                          </button>
                        )}
                      </td>
                      <td className="px-8 py-3 text-[10px] font-bold text-slate-400">
                        {safeFormat(e.fechaHora, 'HH:mm:ss')}
                      </td>
                      <td className="px-8 py-3 text-right">
                        {!(e.anulado === true || e.anulado === 'true') && e.estado !== 'baja' && (
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => handlePrintLabel(e)}
                              className="p-1.5 text-slate-400 hover:text-sleek-accent transition-colors"
                              title="Reimprimir"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setAnularModal({ isOpen: true, envase: e, motivo: '' })}
                              className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
                              title="Anular / Dar de Baja"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        {(e.anulado || e.estado === 'baja') && (
                          <div className="flex flex-col items-end">
                            <Badge variant="danger" className="text-[8px] uppercase">Baja</Badge>
                            <p className="text-[8px] text-slate-400 font-bold mt-1 max-w-[120px] truncate" title={e.motivoBaja}>{e.motivoBaja}</p>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {envasesParaMostrar.length === 0 && (
                    <tr>
                      <td colSpan={selectedLote?.tipo === 'despiece' ? 6 : 5} className="px-8 py-12 text-center text-slate-300 italic text-[10px] font-bold uppercase tracking-widest">
                        Aún no hay envases registrados para este lote
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        <div className="lg:col-span-2 flex flex-col items-center justify-center p-12 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 gap-4 animate-in fade-in duration-1000">
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg border border-slate-100">
            <MonitorSmartphone className="w-10 h-10 opacity-20" />
          </div>
          <p className="text-xs font-black uppercase tracking-widest text-center">Seleccione un lote del panel izquierdo para comenzar a etiquetar</p>
        </div>
      )}

      {/* Modal Confirmar Edición de Lote Finalizado */}
      <Modal
        isOpen={isEditConfirmModalOpen}
        onClose={() => setIsEditConfirmModalOpen(false)}
        title="Confirmar Edición de Lote"
      >
        <div className="space-y-6">
          <div className="p-4 bg-orange-50 rounded-xl border border-orange-100 flex gap-4 items-start">
            <AlertCircle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-xs font-black text-orange-800 uppercase tracking-widest">Atención</p>
              <p className="text-xs text-orange-700 leading-relaxed font-bold">
                Vas a editar un lote ya finalizado. Podrás dar de baja envases con errores y registrar nuevos envases. 
                El stock en el almacén se actualizará automáticamente con cada cambio.
              </p>
            </div>
          </div>

          <p className="text-xs font-bold text-slate-500 text-center">¿Deseas continuar con la edición?</p>

          <div className="flex gap-3">
            <button 
              onClick={() => setIsEditConfirmModalOpen(false)}
              className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-all"
            >
              Cancelar
            </button>
            <button 
              onClick={() => {
                setIsEditingFinalized(true);
                setIsEditConfirmModalOpen(false);
                // Log audit
                const histEntry = {
                  id: `lph-${Date.now()}`,
                  loteId: selectedLote.id,
                  fecha: new Date().toISOString(),
                  usuarioId: currentUser.id,
                  accion: 'Reapertura Edición',
                  detalle: `Se activó el modo edición para el lote finalizado ${selectedLote.numeroLote}.`
                };
                if (selectedLote.tipo === 'produccion') setLotesHistorial([histEntry, ...lotesHistorial]);
                else setLotesDespieceHistorial([histEntry, ...lotesDespieceHistorial]);
                showNotification('Modo edición activado', 'warning');
              }}
              className="flex-[2] py-4 bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20"
            >
              Sí, Continuar Edición
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Resumen Finalización */}
      <Modal 
        isOpen={isFinalizeModalOpen} 
        onClose={() => setIsFinalizeModalOpen(false)} 
        title="Resumen de Finalización de Lote"
      >
        <div className="space-y-6 text-sleek-dark">
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Producto</p>
              <p className="text-xs font-black uppercase truncate">{product?.nombre}</p>
            </div>
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Nº de Lote</p>
              <p className="text-xs font-black font-mono">{selectedLote?.numeroLote}</p>
            </div>
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Envases Registrados</p>
              <p className="text-xs font-black uppercase">{loteEtiquetado?.envases.filter((e: any) => !(e.anulado === true || e.anulado === 'true')).length || 0}</p>
            </div>
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Peso Neto Total</p>
              <p className="text-xs font-black text-sleek-accent uppercase">{pesoEtiquetado.toFixed(3)} kg</p>
            </div>
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Cant. Estimada Original</p>
              <p className="text-xs font-black text-slate-500 uppercase">{pesoTotalEstimado.toFixed(3)} kg</p>
            </div>
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Diferencia</p>
              <p className={cn("text-xs font-black uppercase", (pesoEtiquetado - pesoTotalEstimado) >= 0 ? "text-emerald-600" : "text-rose-600")}>
                {(pesoEtiquetado - pesoTotalEstimado).toFixed(3)} kg
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Almacén Destino (Obligatorio)</label>
              <select 
                value={finalizeForm.almacenDestinoId}
                onChange={(e) => setFinalizeForm({ ...finalizeForm, almacenDestinoId: e.target.value })}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-sleek-dark focus:border-sleek-accent transition-all outline-none"
              >
                <option value="">Seleccione Almacén...</option>
                {almacenes.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4">
               <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Peso Bruto Total (Opcional)</label>
                  <input 
                    type="number"
                    value={finalizeForm.pesoBrutoTotal}
                    onChange={(e) => setFinalizeForm({ ...finalizeForm, pesoBrutoTotal: e.target.value })}
                    step="0.001"
                    placeholder="Ej: 50.500"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-sleek-dark focus:border-sleek-accent transition-all outline-none"
                  />
               </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Observaciones de Cierre</label>
              <textarea 
                value={finalizeForm.observaciones}
                onChange={(e) => setFinalizeForm({ ...finalizeForm, observaciones: e.target.value })}
                rows={3}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-sleek-dark focus:border-sleek-accent transition-all outline-none resize-none"
                placeholder="Notas sobre el cierre del lote..."
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              onClick={() => setIsFinalizeModalOpen(false)}
              className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-all"
            >
              Cancelar
            </button>
            <button 
              onClick={handleConfirmFinalize}
              className="flex-[2] py-4 bg-sleek-dark text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20"
            >
              Confirmar y Finalizar
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Anular/Baja Envase */}
      <Modal 
        isOpen={anularModal.isOpen} 
        onClose={() => setAnularModal({ ...anularModal, isOpen: false })} 
        title="Confirmar Baja de Envase"
      >
        <div className="space-y-6">
          <div className="p-4 bg-rose-50 rounded-xl border border-rose-100 text-rose-800">
             <p className="text-xs font-bold uppercase tracking-widest mb-2 font-mono">¿Estás seguro de dar de baja el envase #{anularModal.envase?.numero}?</p>
             <div className="grid grid-cols-2 gap-4 text-[10px] font-bold">
                <p>Código: <span className="font-mono">{anularModal.envase?.codigoBarras}</span></p>
                <p>Peso: {anularModal.envase?.pesoNeto.toFixed(3)} kg</p>
             </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 font-mono">Motivo de la baja (Obligatorio)</label>
            <textarea 
              value={anularModal.motivo}
              onChange={(e) => setAnularModal({ ...anularModal, motivo: e.target.value })}
              rows={3}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-sleek-dark focus:border-sleek-accent transition-all outline-none resize-none font-mono"
              placeholder="Ej: Peso incorrecto, Etiqueta dañada..."
            />
          </div>

          <div className="flex gap-3">
            <button 
              onClick={() => setAnularModal({ ...anularModal, isOpen: false })}
              className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-all font-mono"
            >
              Cancelar
            </button>
            <button 
              onClick={() => {
                if (!anularModal.motivo.trim()) {
                  showNotification('Debe ingresar un motivo', 'error');
                  return;
                }
                const env = anularModal.envase;
                const leId = resolveLeIdForEnvase(env);
                if (!leId) {
                  showNotification('No se encontró el registro de etiquetado del envase', 'error');
                  return;
                }
                const targetLe = lotesEtiquetados.find((l: any) => l.loteId === leId);
                if (!targetLe) return;

                const updatedEnvases = targetLe.envases.map((envItem: any) =>
                  envItem.numero === env.numero && envItem.codigoBarras === env.codigoBarras
                    ? {
                        ...envItem,
                        estado: 'baja',
                        anulado: true,
                        motivoBaja: anularModal.motivo,
                        fechaBaja: new Date().toISOString(),
                        usuarioBaja: currentUser.name
                      }
                    : envItem
                );
                const active = updatedEnvases.filter((ev: any) =>
                  !(ev.anulado === true || ev.anulado === 'true' || ev.estado === 'baja')
                );
                const pesoTotalEtiquetado = active.reduce((s: number, ev: any) => s + (parseFloat(ev.pesoNeto) || 0), 0);

                setLotesEtiquetados(
                  lotesEtiquetados.map((l: any) =>
                    l.loteId === leId ? { ...l, envases: updatedEnvases, pesoTotalEtiquetado } : l
                  )
                );

                if (selectedLote.tipo === 'despiece') {
                  const prodId = targetLe.productoId;
                  setLotesDespiece(
                    lotesDespiece.map((ld: any) => {
                      if (ld.id !== selectedLoteId) return ld;
                      const cortes = (ld.cortes || []).map((c: any) =>
                        c.productoId === prodId
                          ? { ...c, cantidadReal: pesoTotalEtiquetado, unidadesReales: active.length }
                          : c
                      );
                      const totalCortesKg = cortes.reduce((s: number, c: any) => s + (parseFloat(c.cantidadReal) || 0), 0);
                      const cantIng = parseFloat(ld.cantidadIngresada) || 0;
                      const rendimientoReal =
                        cantIng > 0 ? formatNum((totalCortesKg / cantIng) * 100, 1) : ld.rendimientoReal;
                      return { ...ld, cortes, rendimientoReal, totalCortes: totalCortesKg };
                    })
                  );
                } else {
                  const prodPT = productos.find((p: any) => p.id === targetLe.productoId);
                  const usesUnits = prodPT?.unidadMedidaId !== 'u1';
                  setLotesProduccion(
                    lotesProduccion.map((lp: any) => {
                      if (lp.id !== selectedLoteId) return lp;
                      return {
                        ...lp,
                        pesoNeto: pesoTotalEtiquetado,
                        unidadesReales: usesUnits ? active.length : lp.unidadesReales
                      };
                    })
                  );
                }

                const hadStockEntry =
                  selectedLote.estado === 'Finalizado' &&
                  !(env.anulado === true || env.anulado === 'true') &&
                  env.estado === 'en_stock';
                if (hadStockEntry) {
                  const now = new Date().toISOString();
                  const prod = productos.find((p: any) => p.id === targetLe.productoId);
                  const unit = unidades.find((u: any) => u.id === prod?.unidadMedidaId)?.abreviatura || 'kg';
                  const almId =
                    selectedLote.tipo === 'despiece'
                      ? (targetLe.almacenId ||
                          selectedLote.cortes?.find((c: any) => c.productoId === targetLe.productoId)
                            ?.almacenDestinoId ||
                          almacenes[0]?.id ||
                          '')
                      : (selectedLote.almacenDestinoId || almacenes[0]?.id || '');
                  const loteNumMov =
                    selectedLote.tipo === 'despiece'
                      ? `${selectedLote.numeroLote}-${Math.max(0, (selectedLote.cortes || []).findIndex((c: any) => c.productoId === targetLe.productoId)) + 1}`
                      : selectedLote.numeroLote;
                  const move: Movimiento = {
                    id: `MOV-${Date.now()}-baja-env`,
                    tipo: 'salida',
                    productoId: targetLe.productoId,
                    almacenId: almId,
                    cantidad: prod?.unidadMedidaId === 'u1' ? env.pesoNeto : 1,
                    unidad: unit,
                    cantidadKg: env.pesoNeto,
                    motivo: `Baja de envase (#${env.numero}) - ${anularModal.motivo}`,
                    loteNumero: loteNumMov,
                    fechaIngreso: safeFormat(new Date(), 'yyyy-MM-dd'),
                    fechaVencimiento: selectedLote.fechaVencimiento,
                    origen: selectedLote.tipo === 'despiece' ? 'despiece' : 'produccion',
                    usuario: currentUser.name,
                    fechaHora: now,
                    anulado: false,
                    referencia: selectedLote.numeroLote,
                    observaciones: `Baja desde estación de etiquetas. ${env.codigoBarras}`
                  };
                  setMovimientos([move, ...movimientos]);
                }

                setAnularModal({ isOpen: false, envase: null, motivo: '' });
                showNotification(`Envase #${env.numero} dado de baja.`, 'success');
              }}
              className="flex-[2] py-4 bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-rose-600 transition-all font-mono shadow-lg shadow-rose-500/20"
            >
              Confirmar Baja
            </button>
          </div>
        </div>
      </Modal>
    </div>
  </div>
);
};

const UserForm = ({ editingItem, loggedUser, onSave, onClose }: any) => {
  const isSuperadmin = editingItem?.username === 'GuidoM';
  const isSelf = loggedUser?.id === editingItem?.id;

  const [formData, setFormData] = useState({
    name: editingItem?.name || '',
    username: editingItem?.username || '',
    password: '',
    confirmPassword: '',
    role: editingItem?.role || 'Operario',
    estado: editingItem?.estado || 'activo',
    permisos: editingItem?.permisos ? JSON.parse(JSON.stringify(editingItem.permisos)) : JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS)),
    inicioConfig: getInicioConfig(editingItem || null),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.username) return;
    if (!editingItem && !formData.password) {
      globalAlert('La contraseña es obligatoria para nuevos usuarios');
      return;
    }
    if (formData.password && formData.password !== formData.confirmPassword) {
      globalAlert('Las contraseñas no coinciden');
      return;
    }

    const userData: any = {
      ...editingItem,
      name: formData.name,
      username: formData.username,
      role: formData.role,
      estado: formData.estado,
      permisos: isSuperadmin ? DEFAULT_PERMISSIONS : formData.permisos,
      inicioConfig: isSuperadmin ? { ...DEFAULT_INICIO_CONFIG } : formData.inicioConfig,
    };

    if (formData.password) {
      userData.password = formData.password;
    }

    onSave(userData);
  };

  const handleToggleModule = (moduleKey: keyof Permisos, checked: boolean) => {
    if (isSuperadmin) return;
    if (isSelf && moduleKey === 'usuarios') return; // Cannot toggle own users module

    setFormData((prev: any) => {
      const newPermisos = { ...prev.permisos };
      const mod = { ...newPermisos[moduleKey] };
      for (const section in mod) {
        if (isSelf && moduleKey === 'usuarios' && section === 'gestion_usuarios') continue;
        mod[section] = checked;
      }
      newPermisos[moduleKey] = mod;
      return { ...prev, permisos: newPermisos };
    });
  };

  const handleToggleSection = (moduleKey: keyof Permisos, sectionKey: string, checked: boolean) => {
    if (isSuperadmin) return;
    if (isSelf && moduleKey === 'usuarios' && sectionKey === 'gestion_usuarios') return; // Cannot toggle own user mgmt

    setFormData((prev: any) => {
      const newPermisos = { ...prev.permisos };
      newPermisos[moduleKey] = {
        ...newPermisos[moduleKey],
        [sectionKey]: checked
      };
      return { ...prev, permisos: newPermisos };
    });
  };

  const setAllPermissions = (checked: boolean) => {
    if (isSuperadmin) return;
    setFormData((prev: any) => {
      const newPermisos = { ...prev.permisos };
      for (const modKey in newPermisos) {
        if (isSelf && modKey === 'usuarios') continue; // Skip own user module if unchecking all
        for (const secKey in newPermisos[modKey as keyof Permisos]) {
           newPermisos[modKey as keyof Permisos][secKey as string] = checked;
        }
      }
      return { ...prev, permisos: newPermisos };
    });
  };

  const modulesLayout: { key: keyof Permisos, label: string, color: string, sections: { key: string, label: string }[] }[] = [
    { key: 'inventario', label: '📦 INVENTARIO', color: 'bg-sky-50 outline-sky-200', sections: [ {key: 'dashboard', label: 'Dashboard'}, {key: 'almacenes', label: 'Almacenes'}, {key: 'productos', label: 'Productos'}, {key: 'movimientos', label: 'Movimientos'}, {key: 'alertas', label: 'Alertas'}, {key: 'reportes', label: 'Reportes'} ] },
    { key: 'produccion', label: '🏭 PRODUCCIÓN', color: 'bg-emerald-50 outline-emerald-200', sections: [ {key: 'lotes_produccion', label: 'Lotes de Producción'}, {key: 'lotes_despiece', label: 'Lotes de Despiece'}, {key: 'recetas_estandar', label: 'Recetas Estándar'}, {key: 'plantillas_despiece', label: 'Plantillas de Despiece'}, {key: 'etiquetas', label: 'Etiquetas'}, {key: 'dashboard', label: 'Dashboard'}, {key: 'trazabilidad', label: 'Trazabilidad'} ] },
    { key: 'ventas', label: '💰 VENTAS', color: 'bg-amber-50 outline-amber-200', sections: [ {key: 'ventas_pedidos', label: 'Ventas y Pedidos'}, {key: 'dashboard_ventas', label: 'Dashboard de Ventas'}, {key: 'clientes', label: 'Clientes'}, {key: 'listas_precios', label: 'Listas de Precios'}, {key: 'puntos_venta', label: 'Puntos de Venta'} ] },
    { key: 'egresos', label: '📤 EGRESOS', color: 'bg-rose-50 outline-rose-200', sections: [ {key: 'egresos_compras', label: 'Egresos y Compras'}, {key: 'proveedores', label: 'Proveedores'}, {key: 'tipos_egreso', label: 'Tipos de Egreso'}, {key: 'plan_cuentas', label: 'Plan de Cuentas'} ] },
    { key: 'usuarios', label: '👤 USUARIOS', color: 'bg-slate-100 outline-slate-300', sections: [ {key: 'gestion_usuarios', label: 'Gestión de Usuarios'} ] }
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-8 flex flex-col h-full max-h-[85vh]">
      <div className="flex-1 overflow-y-auto space-y-8 pr-2">
        {/* Sección 1 — Datos del Usuario */}
        <div>
          <h3 className="text-sm font-bold text-sleek-dark uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">Datos del Usuario</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Nombre Completo</label>
              <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Nombre de Usuario</label>
              <input type="text" required value={formData.username} readOnly={isSuperadmin} onChange={e => setFormData({...formData, username: e.target.value.replace(/\s+/g, '')})} className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none ${isSuperadmin ? 'opacity-70 cursor-not-allowed' : ''}`} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Contraseña {editingItem && '(dejar vacío para no cambiar)'}</label>
              <input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Confirmar Contraseña</label>
              <input type="password" value={formData.confirmPassword} onChange={e => setFormData({...formData, confirmPassword: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Estado</label>
              <select value={formData.estado} disabled={isSuperadmin} onChange={e => setFormData({...formData, estado: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none disabled:opacity-50">
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
            <div>
               <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Rol (Legado)</label>
               <select value={formData.role} disabled={isSuperadmin} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none disabled:opacity-50">
                  <option value="Operario">Operario</option>
                  <option value="Administrador">Administrador</option>
               </select>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-sleek-dark uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">Pantalla de inicio</h3>
          <p className="text-xs text-slate-500 mb-4">Seleccioná qué bloques verá este usuario en la pantalla de inicio.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              { key: 'misLotes' as const, label: 'Mis lotes del día' },
              { key: 'stockCritico' as const, label: 'Stock crítico' },
              { key: 'proximosVencer' as const, label: 'Próximos a vencer' },
              { key: 'actividadReciente' as const, label: 'Actividad reciente' },
            ]).map(({ key, label }) => (
              <label key={key} className={cn("flex items-center gap-3 p-3 rounded-lg border border-slate-100 cursor-pointer hover:bg-slate-50", isSuperadmin && "opacity-60 cursor-not-allowed")}>
                <input
                  type="checkbox"
                  disabled={isSuperadmin}
                  checked={formData.inicioConfig[key]}
                  onChange={(e) => setFormData((prev: any) => ({
                    ...prev,
                    inicioConfig: { ...prev.inicioConfig, [key]: e.target.checked },
                  }))}
                  className="w-4 h-4 rounded border-slate-300 text-sleek-accent focus:ring-sleek-accent"
                />
                <span className="text-xs font-bold text-slate-700">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Sección 2 — Permisos de Acceso */}
        <div>
          <div className="flex justify-between items-end mb-4 border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-sm font-bold text-sleek-dark uppercase tracking-widest">🔐 PERMISOS DE ACCESO</h3>
              <p className="text-xs text-slate-500 mt-1">Seleccioná los módulos y secciones a los que este usuario tendrá acceso.</p>
            </div>
            {!isSuperadmin && (
              <div className="flex gap-2">
                <button type="button" onClick={() => setAllPermissions(true)} className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded text-xs font-bold hover:bg-emerald-100 transition-colors">✅ Marcar Todos</button>
                <button type="button" onClick={() => setAllPermissions(false)} className="px-3 py-1.5 bg-rose-50 text-rose-600 rounded text-xs font-bold hover:bg-rose-100 transition-colors">❌ Desmarcar Todos</button>
              </div>
            )}
          </div>

          {isSuperadmin && (
            <div className="bg-amber-50 text-amber-800 p-4 rounded-lg mb-6 text-sm font-medium border border-amber-200">
              El superadministrador (GuidoM) siempre tiene acceso completo a todo el sistema. Los permisos no pueden ser modificados.
            </div>
          )}

          <div className="space-y-4">
            {modulesLayout.map(mod => {
              const moduleSections = formData.permisos[mod.key] || {};
              const totalSections = mod.sections.length;
              const activeSections = Object.values(moduleSections).filter(Boolean).length;
              const isAllChecked = activeSections === totalSections;
              const isIndeterminate = activeSections > 0 && activeSections < totalSections;

              return (
                <div key={mod.key} className={cn("p-4 rounded-xl outline outline-1 outline-offset-0", mod.color)}>
                  <div className="flex items-center justify-between mb-3 border-b border-black/5 pb-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        disabled={isSuperadmin || (isSelf && mod.key === 'usuarios')}
                        checked={isAllChecked || isIndeterminate}
                        ref={(input) => { if (input) input.indeterminate = isIndeterminate; }}
                        onChange={(e) => handleToggleModule(mod.key, e.target.checked)}
                        className="w-5 h-5 rounded border-slate-300 text-sleek-accent focus:ring-sleek-accent"
                      />
                      <span className="font-bold text-sm uppercase tracking-widest text-slate-800">{mod.label}</span>
                    </label>
                    {!isSuperadmin && !(isSelf && mod.key === 'usuarios') && (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => handleToggleModule(mod.key, true)} className="text-[10px] font-bold text-slate-500 hover:text-sleek-accent uppercase tracking-widest bg-white/50 px-2 py-1 rounded">Marcar todo</button>
                        <button type="button" onClick={() => handleToggleModule(mod.key, false)} className="text-[10px] font-bold text-slate-500 hover:text-sleek-danger uppercase tracking-widest bg-white/50 px-2 py-1 rounded">Desmarcar todo</button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pl-8">
                    {mod.sections.map(sec => {
                      const disabled = isSuperadmin || (isSelf && mod.key === 'usuarios' && sec.key === 'gestion_usuarios');
                      return (
                        <label key={sec.key} className={cn("flex items-center gap-3 p-2 rounded-lg transition-colors cursor-pointer", !disabled && "hover:bg-black/5")}>
                          <input 
                            type="checkbox" 
                            disabled={disabled}
                            checked={!!moduleSections[sec.key]}
                            onChange={(e) => handleToggleSection(mod.key, sec.key, e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-sleek-accent focus:ring-sleek-accent"
                          />
                          <span className="text-sm font-medium text-slate-700">{sec.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-4 pt-4 border-t border-slate-100 flex-shrink-0">
        <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-lg text-sm font-bold text-slate-500 hover:bg-slate-100 transition-colors">Cancelar</button>
        <button type="submit" className="px-8 py-2.5 bg-sleek-accent text-white rounded-lg text-sm font-bold shadow-lg shadow-sleek-accent/20 hover:bg-emerald-500 transition-all">Guardar Usuario</button>
      </div>
    </form>
  );
};

const UsuariosView = ({ 
  users, 
  setModalType, 
  setIsModalOpen, 
  setEditingItem, 
  setUsers, 
  showNotification,
  loggedUser
}: any) => {

  const getPermisosSummary = (user: User) => {
    if (user.username === 'GuidoM') return '🔒 Acceso completo';
    if (!user.permisos) return '🔒 Acceso completo';
    
    let activeModules = 0;
    for (const modKey in user.permisos) {
      if (Object.values(user.permisos[modKey as keyof Permisos]).some(Boolean)) {
        activeModules++;
      }
    }
    
    if (activeModules === Object.keys(user.permisos).length && Object.values(user.permisos).every(mod => Object.values(mod).every(Boolean))) {
       return '🔒 Acceso completo';
    }

    if (activeModules === 0) return '🚫 Sin acceso';

    const actMods: string[] = [];
    if (hasAnyPermissionInModule(user, 'inventario')) actMods.push('Inventario');
    if (hasAnyPermissionInModule(user, 'produccion')) actMods.push('Producción');
    if (hasAnyPermissionInModule(user, 'ventas')) actMods.push('Ventas');
    if (hasAnyPermissionInModule(user, 'egresos')) actMods.push('Egresos');
    if (hasAnyPermissionInModule(user, 'usuarios')) actMods.push('Usuarios');

    return `📋 ${activeModules} módulos (${actMods.join(', ')})`;
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-sleek-dark uppercase tracking-widest">Gestión de Usuarios</h2>
        <button 
          onClick={() => { setModalType('USER_FORM'); setIsModalOpen(true); setEditingItem(null); }}
          className="bg-sleek-dark hover:bg-slate-800 text-white px-6 py-2 rounded font-bold text-xs uppercase tracking-widest transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nuevo Usuario
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {users.map((user: any) => (
          <div key={user.id}>
            <Card className="p-6 border-t-4 border-sleek-accent">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded bg-slate-100 flex items-center justify-center text-sleek-dark font-bold text-lg">
                    {user.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-sleek-dark uppercase tracking-tight">{user.name}</h3>
                    <Badge variant={user.estado === 'inactivo' ? 'danger' : 'success'}>{user.estado === 'inactivo' ? 'Inactivo' : 'Activo'}</Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditingItem(user); setModalType('USER_FORM'); setIsModalOpen(true); }} className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-sleek-accent transition-all animate-in zoom-in" title="Editar">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => {
                        if (user.username === 'GuidoM') {
                            globalAlert('No se puede eliminar al superadministrador del sistema.', 'error');
                            return;
                        }
                        if (user.id === loggedUser.id) {
                            globalAlert('No podés eliminar tu propia cuenta.', 'error');
                            return;
                        }
                        confirmDialog('¿Está seguro de eliminar este usuario?', () => {
                            setUsers(users.filter((u: any) => u.id !== user.id));
                            showNotification('Usuario eliminado', 'success');
                        });
                    }} 
                    className={`p-1.5 rounded transition-all animate-in zoom-in ${user.username === 'GuidoM' || user.id === loggedUser.id ? 'text-slate-200 cursor-not-allowed' : 'hover:bg-slate-100 text-slate-400 hover:text-sleek-danger'}`}
                    title={user.username === 'GuidoM' ? 'No se puede eliminar al superadministrador' : 'Eliminar'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Usuario</span>
                  <span className="text-xs font-bold text-sleek-dark">{user.username}</span>
                </div>
                <div className="flex justify-between items-center border-t border-black/5 pt-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Permisos</span>
                  <span className="text-xs font-semibold text-sleek-accent">
                    {getPermisosSummary(user)}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
};

const AlmacenForm = ({ editingItem, unidades, onSave, onClose }: any) => {
  const [formData, setFormData] = useState({
    nombre: editingItem?.nombre || '',
    descripcion: editingItem?.descripcion || '',
    capacidadMax: editingItem?.capacidadMax || 0,
    capacidadUnidadId: editingItem?.capacidadUnidadId || unidades[0]?.id || '',
    tempMin: editingItem?.tempMin || 0,
    tempMax: editingItem?.tempMax || 0,
    tipoAlmacenamiento: editingItem?.tipoAlmacenamiento || 'Ambiente'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre || !formData.capacidadMax || !formData.capacidadUnidadId) return;
    if (formData.tempMax < formData.tempMin) {
      globalAlert('La temperatura máxima debe ser mayor o igual a la mínima');
      return;
    }
    onSave({ ...formData, id: editingItem?.id || Date.now().toString() });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Nombre del Almacén</label>
          <input 
            type="text" 
            required
            value={formData.nombre || ''}
            onChange={e => setFormData({ ...formData, nombre: e.target.value })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none transition-all"
            placeholder="Ej: Cámara Frigorífica MP"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Descripción / Ubicación</label>
          <textarea 
            value={formData.descripcion || ''}
            onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none transition-all h-24 resize-none"
            placeholder="Detalle libre..."
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Capacidad Máxima</label>
          <input 
            type="number" 
            required
            value={formData.capacidadMax || ''}
            onChange={e => setFormData({ ...formData, capacidadMax: parseFloat(e.target.value) || 0 })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none transition-all"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Unidad de Medida</label>
          <select 
            required
            value={formData.capacidadUnidadId || ''}
            onChange={e => setFormData({ ...formData, capacidadUnidadId: e.target.value })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none transition-all"
          >
            {unidades.map((u: any) => (
              <option key={u.id} value={u.id}>{u.nombre} ({u.abreviatura})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Temp. Mínima (°C)</label>
          <input 
            type="number" 
            required
            value={formData.tempMin || 0}
            onChange={e => setFormData({ ...formData, tempMin: parseFloat(e.target.value) || 0 })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none transition-all"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Temp. Máxima (°C)</label>
          <input 
            type="number" 
            required
            value={formData.tempMax || 0}
            onChange={e => setFormData({ ...formData, tempMax: parseFloat(e.target.value) || 0 })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none transition-all"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Tipo de Almacenamiento</label>
          <select 
            required
            value={formData.tipoAlmacenamiento || 'Ambiente'}
            onChange={e => setFormData({ ...formData, tipoAlmacenamiento: e.target.value })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none transition-all"
          >
            {CONDICIONES_ALMACENAMIENTO.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-6 py-2 text-slate-500 font-bold text-xs uppercase tracking-widest hover:bg-slate-50 rounded transition-all">Cancelar</button>
        <button type="submit" className="px-8 py-2 bg-sleek-accent text-white font-bold text-xs uppercase tracking-widest rounded shadow-lg shadow-sleek-accent/20 hover:bg-amber-600 transition-all">Guardar Almacén</button>
      </div>
    </form>
  );
};

const StockSeguridadForm = ({ editingItem, onSave, onClose }: any) => {
  const [cantidad, setCantidad] = useState(editingItem?.cantidad || 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(cantidad);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Stock de Seguridad</label>
        <input 
          type="number" 
          required
          min="0"
          value={cantidad || ''}
          onChange={e => setCantidad(parseFloat(e.target.value) || 0)}
          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none transition-all"
        />
      </div>
      <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-6 py-2 text-slate-500 font-bold text-xs uppercase tracking-widest hover:bg-slate-50 rounded transition-all">Cancelar</button>
        <button type="submit" className="px-8 py-2 bg-sleek-accent text-white font-bold text-xs uppercase tracking-widest rounded shadow-lg shadow-sleek-accent/20 hover:bg-amber-600 transition-all">Guardar</button>
      </div>
    </form>
  );
};


// --- Movimientos View ---

const MovimientosView = ({ 
  movimientos, setMovimientos, 
  productos, almacenes, unidades, 
  currentUser, showNotification, 
  getPesoEquivalente, lotesStock,
  descuentosPendientes, setDescuentosPendientes,
  mercaderiaPendiente, setMercaderiaPendiente
}: any) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'entrada' | 'salida' | 'transferencia' | 'detalle' | 'asignar_compra' | null>(null);
  const [selectedMov, setSelectedMov] = useState<any>(null);
  const [selectedMapping, setSelectedMapping] = useState<Record<string, string>>({}); // id -> almacenId
  
  // Filtros
  const [filterTipo, setFilterTipo] = useState('Todos');
  const [filterOrigen, setFilterOrigen] = useState('Todos');
  const [filterProductoId, setFilterProductoId] = useState('Todos');
  const [filterAlmacenId, setFilterAlmacenId] = useState('Todos');
  const [filterFechaDesde, setFilterFechaDesde] = useState('');
  const [filterFechaHasta, setFilterFechaHasta] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const filteredMovimientos = useMemo(() => {
    return movimientos.filter((m: any) => {
      const prod = productos.find((p: any) => p.id === m.productoId);
      if (!prod) return false;

      const matchesTipo = filterTipo === 'Todos' || m.tipo === filterTipo.toLowerCase();
      const matchesOrigen = filterOrigen === 'Todos' || m.origen === filterOrigen.toLowerCase();
      const matchesProducto = filterProductoId === 'Todos' || m.productoId === filterProductoId;
      const matchesAlmacen = filterAlmacenId === 'Todos' || m.almacenId === filterAlmacenId || m.almacenDestinoId === filterAlmacenId;
      const matchesSearch = prod.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           m.loteNumero.toLowerCase().includes(searchTerm.toLowerCase());
      
      const mDate = parseISO(m.fechaHora);
      const matchesDesde = !filterFechaDesde || !safeIsBefore(mDate, filterFechaDesde);
      const matchesHasta = !filterFechaHasta || !safeIsAfter(mDate, addDays(parseISO(filterFechaHasta), 1));

      return matchesTipo && matchesOrigen && matchesProducto && matchesAlmacen && matchesSearch && matchesDesde && matchesHasta;
    }).sort((a: any, b: any) => new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime());
  }, [movimientos, filterTipo, filterOrigen, filterProductoId, filterAlmacenId, filterFechaDesde, filterFechaHasta, searchTerm, productos]);

  const paginatedMovs = filteredMovimientos.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(filteredMovimientos.length / itemsPerPage);

  const handleAnular = (mov: any) => {
    if (mov.origen !== 'manual') {
      showNotification('Solo se pueden anular movimientos manuales', 'error');
      return;
    }
    confirmDialog('¿Está seguro de anular este movimiento? Se revertirá el stock.', () => {
      const updated = movimientos.map((m: any) => m.id === mov.id ? { 
        ...m, 
        anulado: true, 
        anuladoPor: currentUser.name, 
        anuladoFecha: new Date().toISOString() 
      } : m);
      setMovimientos(updated);
      showNotification('Movimiento anulado y stock revertido', 'success');
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Alert Section for Pending Purchases */}
      {mercaderiaPendiente.length > 0 && (
        <div className="bg-sleek-accent/10 border-2 border-sleek-accent rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl shadow-sleek-accent/5 animate-pulse-gentle">
          <div className="flex items-center gap-6 text-center md:text-left">
            <div className="w-16 h-16 rounded-full bg-sleek-accent flex items-center justify-center text-white shadow-lg">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-black text-sleek-dark uppercase tracking-tight">Mercadería pendiente de ingresar</h3>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Se detectaron {mercaderiaPendiente.length} items de compras confirmadas que aún no tienen almacén asignado.</p>
            </div>
          </div>
          <button 
            onClick={() => {
              const mapping: any = {};
              mercaderiaPendiente.forEach((m: any) => mapping[m.id] = almacenes[0]?.id || '');
              setSelectedMapping(mapping);
              setModalType('asignar_compra'); 
              setIsModalOpen(true); 
            }}
            className="px-8 py-4 bg-sleek-dark text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl hover:shadow-sleek-accent/20 hover:-translate-y-1 transition-all"
          >
            Asignar a Almacenes
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h1 className="text-2xl font-black text-sleek-dark uppercase tracking-widest leading-tight">Historial de Movimientos</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Inventario / Movimientos</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={() => { setModalType('entrada'); setIsModalOpen(true); }}
            className="px-6 py-3 bg-sleek-success text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-sleek-success/20 flex items-center gap-2"
          >
            <ArrowDownLeft className="w-4 h-4" /> Nueva Entrada
          </button>
          <button 
            onClick={() => { setModalType('salida'); setIsModalOpen(true); }}
            className="px-6 py-3 bg-sleek-danger text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-rose-600 transition-all shadow-lg shadow-sleek-danger/20 flex items-center gap-2"
          >
            <ArrowUpRight className="w-4 h-4" /> Nueva Salida
          </button>
          <button 
            onClick={() => { setModalType('transferencia'); setIsModalOpen(true); }}
            className="px-6 py-3 bg-sky-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-sky-600 transition-all shadow-lg shadow-sky-500/20 flex items-center gap-2"
          >
            <ArrowRightLeft className="w-4 h-4" /> Transferencia
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Buscar producto o lote..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold uppercase tracking-tight focus:ring-2 focus:ring-sleek-accent outline-none"
            />
          </div>
          <select 
            value={filterTipo}
            onChange={e => setFilterTipo(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold uppercase tracking-widest text-slate-500 outline-none"
          >
            <option value="Todos">Todos los Tipos</option>
            <option value="Entrada">Entradas</option>
            <option value="Salida">Salidas</option>
            <option value="Transferencia">Transferencias</option>
          </select>
          <select 
            value={filterOrigen}
            onChange={e => setFilterOrigen(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold uppercase tracking-widest text-slate-500 outline-none"
          >
            <option value="Todos">Todos los Orígenes</option>
            <option value="Manual">Manual</option>
            <option value="Produccion">Producción</option>
            <option value="Despiece">Despiece</option>
          </select>
          <div className="xl:col-span-2 grid grid-cols-2 gap-2">
            <input 
              type="date"
              value={filterFechaDesde}
              onChange={e => setFilterFechaDesde(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold uppercase text-slate-500 outline-none"
              placeholder="Desde"
            />
            <input 
              type="date"
              value={filterFechaHasta}
              onChange={e => setFilterFechaHasta(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold uppercase text-slate-500 outline-none"
              placeholder="Hasta"
            />
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha / Hora</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Producto</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Cantidad</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Almacén</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Motivo</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Lote</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Origen</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginatedMovs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-20 text-center text-slate-300">
                    <History className="w-12 h-12 mx-auto mb-4 opacity-10" />
                    <p className="font-bold uppercase tracking-widest">No se encontraron movimientos</p>
                  </td>
                </tr>
              ) : (
                paginatedMovs.map((m: any) => {
                  const prod = productos.find((p: any) => p.id === m.productoId);
                  const alm = almacenes.find((a: any) => a.id === m.almacenId);
                  const almDest = m.almacenDestinoId ? almacenes.find((a: any) => a.id === m.almacenDestinoId) : null;
                  
                  return (
                    <tr key={m.id} className={cn(
                      "group hover:bg-slate-50/50 transition-colors",
                      m.anulado && "opacity-50 grayscale"
                    )}>
                      <td className="px-6 py-4">
                        <span className="text-xs font-bold text-sleek-dark block">{safeFormat(m.fechaHora, 'dd/MM/yyyy')}</span>
<span className="text-[10px] text-slate-400 font-mono">{safeFormat(m.fechaHora, 'HH:mm')} hs</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className={cn(
                          "px-2 py-1 rounded inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest",
                          m.tipo === 'entrada' ? "bg-sleek-success/10 text-sleek-success" :
                          m.tipo === 'salida' ? "bg-sleek-danger/10 text-sleek-danger" : "bg-sky-100 text-sky-600"
                        )}>
                          {m.tipo === 'entrada' ? <ArrowDownLeft className="w-3 h-3" /> : 
                           m.tipo === 'salida' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowRightLeft className="w-3 h-3" />}
                          {m.tipo}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-black text-sleek-dark uppercase tracking-tight">{prod?.nombre}</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase">{prod?.codigo}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className={cn(
                          "font-mono font-black text-sm",
                          m.tipo === 'entrada' ? "text-sleek-success" : 
                          m.tipo === 'salida' ? "text-sleek-danger" : "text-sky-600"
                        )}>
                          {m.tipo === 'entrada' ? '+' : '-'}{formatNum(m.cantidad)} {m.unidad}
                        </p>
                        {m.unidad !== 'kg' && (
                          <p className="text-[10px] text-slate-400">({formatNum(m.cantidadKg, 2)} kg)</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-sleek-dark uppercase truncate max-w-[150px]">
                          {m.tipo === 'transferencia' ? (
                            <span className="flex items-center gap-1.5">
                              {alm?.nombre} <ArrowRight className="w-3 h-3 text-slate-300" /> {almDest?.nombre}
                            </span>
                          ) : alm?.nombre}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">{m.motivo}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-[11px] font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">{m.loteNumero}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge variant={
                          m.origen === 'manual' ? 'default' :
                          m.origen === 'produccion' ? 'info' : 'warning'
                        }>{m.origen}</Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => { setSelectedMov(m); setModalType('detalle'); setIsModalOpen(true); }}
                            className="p-2 text-slate-400 hover:text-sleek-accent transition-all"
                            title="Ver Detalle"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {m.origen === 'manual' && !(m.anulado === true || m.anulado === 'true' || m.estado === 'anulado') && (
                            <button 
                              onClick={() => handleAnular(m)}
                              className="p-2 text-slate-400 hover:text-sleek-danger transition-all"
                              title="Anular Movimiento"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="p-6 border-t border-slate-100 flex justify-between items-center bg-slate-50/30">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Mostrando {paginatedMovs.length} de {filteredMovimientos.length} movimientos
            </p>
            <div className="flex gap-2">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="px-4 py-2 border border-slate-200 rounded text-xs font-bold uppercase transition-all disabled:opacity-30 hover:bg-white"
              >
                Anterior
              </button>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
                className="px-4 py-2 border border-slate-200 rounded text-xs font-bold uppercase transition-all disabled:opacity-30 hover:bg-white"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Modals para Movimientos */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setModalType(null); }}
        title={
          modalType === 'entrada' ? '📥 Registro de Entrada' :
          modalType === 'salida' ? '📤 Registro de Salida' :
          modalType === 'transferencia' ? '🔄 Transferencia de Stock' : 
          modalType === 'asignar_compra' ? '📦 Asignar Ingreso de Mercadería' : '📄 Detalle del Movimiento'
        }
      >
        {modalType === 'asignar_compra' && (
          <div className="space-y-8 min-w-[320px] md:min-w-[600px]">
             <div className="space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Lista de Ingresos Pendientes</p>
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                   {mercaderiaPendiente.map((item: any) => {
                     const prod = productos.find((p: any) => p.id === item.productoId);
                     return (
                       <div key={item.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
                          <div className="flex-1">
                             <p className="text-[11px] font-black text-sleek-dark uppercase tracking-tight">{prod?.nombre}</p>
                             <p className="text-[9px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest">Compra: {item.egresoComprobante} • Cant: {item.cantidad} {prod?.unidadMedida}</p>
                             <p className="text-[9px] font-bold text-sleek-accent mt-0.5 uppercase tracking-widest">Lote Prov: {item.loteProveedor}</p>
                          </div>
                          <div className="w-full md:w-48">
                             <label className="text-[8px] font-black text-slate-400 uppercase mb-1 block">Destino</label>
                             <select 
                               value={selectedMapping[item.id] || ''}
                               onChange={(e) => setSelectedMapping({ ...selectedMapping, [item.id]: e.target.value })}
                               className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-[10px] font-bold uppercase"
                             >
                               {almacenes.map((a: any) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                             </select>
                          </div>
                       </div>
                     )
                   })}
                </div>
             </div>

             <div className="flex gap-4 pt-4 border-t border-slate-100">
                <button 
                  onClick={() => setIsModalOpen(false)} 
                  className="flex-1 py-4 bg-slate-100 text-slate-600 font-black rounded-xl uppercase tracking-widest text-[10px]"
                >
                  Omitir ahora
                </button>
                <button 
                  onClick={() => {
                    const newMovs: any[] = [];
                    mercaderiaPendiente.forEach((item: any) => {
                      const prod = productos.find((p: any) => p.id === item.productoId);
                      const fact = getPesoEquivalente(item.productoId);
                      newMovs.push({
                        id: `mov-${Date.now()}-${item.id}`,
                        tipo: 'entrada',
                        productoId: item.productoId,
                        cantidad: item.cantidad,
                        cantidadKg: item.cantidad * fact,
                        unidad: prod?.unidadMedida,
                        almacenId: selectedMapping[item.id],
                        fechaHora: new Date().toISOString(),
                        fechaIngreso: format(new Date(), 'yyyy-MM-dd'),
                        fechaVencimiento: item.fechaVencimiento || format(addDays(new Date(), 30), 'yyyy-MM-dd'),
                        loteNumero: item.loteProveedor || 'S/L',
                        motivo: `Ingreso por Compra ${item.egresoComprobante}`,
                        origen: 'manual',
                        usuario: currentUser.name
                      });
                    });
                    setMovimientos([...newMovs, ...movimientos]);
                    setMercaderiaPendiente([]);
                    showNotification('Mercadería ingresada al inventario', 'success');
                    setIsModalOpen(false);
                  }}
                  className="flex-[2] py-4 bg-sleek-dark text-white font-black rounded-xl shadow-2xl uppercase tracking-widest text-[10px]"
                >
                  Confirmar Ingreso de Stock
                </button>
             </div>
          </div>
        )}
        {modalType === 'entrada' && (
          <EntradaForm 
            productos={productos} 
            almacenes={almacenes}
            unidades={unidades}
            getPesoEquivalente={getPesoEquivalente}
            currentUser={currentUser}
            onClose={() => setIsModalOpen(false)}
            onSave={(newMov: Movimiento) => {
              setMovimientos([newMov, ...movimientos]);
              showNotification(`Entrada registrada: +${newMov.cantidad} ${newMov.unidad} de ${productos.find((p: any) => p.id === newMov.productoId)?.nombre}`, 'success');
              setIsModalOpen(false);
            }}
            descuentosPendientes={descuentosPendientes}
            setDescuentosPendientes={setDescuentosPendientes}
          />
        )}
        {modalType === 'salida' && (
          <SalidaForm 
            productos={productos} 
            almacenes={almacenes}
            unidades={unidades}
            lotesStock={lotesStock}
            getPesoEquivalente={getPesoEquivalente}
            currentUser={currentUser}
            onClose={() => setIsModalOpen(false)}
            onSave={(newMovs: Movimiento[]) => {
              setMovimientos([...newMovs, ...movimientos]);
              showNotification(`Salida registrada con éxito`, 'success');
              setIsModalOpen(false);
            }}
          />
        )}
        {modalType === 'transferencia' && (
          <TransferenciaForm 
            productos={productos} 
            almacenes={almacenes}
            unidades={unidades}
            lotesStock={lotesStock}
            getPesoEquivalente={getPesoEquivalente}
            currentUser={currentUser}
            onClose={() => setIsModalOpen(false)}
            onSave={(newMovs: Movimiento[]) => {
              setMovimientos([...newMovs, ...movimientos]);
              showNotification(`Transferencia registrada con éxito`, 'success');
              setIsModalOpen(false);
            }}
          />
        )}
        {modalType === 'detalle' && selectedMov && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ID Movimiento</p>
                <p className="text-sm font-bold text-sleek-dark font-mono">{selectedMov.id}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha y Hora</p>
                <p className="text-sm font-bold text-sleek-dark">{safeFormat(selectedMov.fechaHora, 'dd/MM/yyyy HH:mm')} hs</p>
              </div>
              <div className="col-span-2 border-t border-slate-100 pt-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Producto</p>
                <p className="text-lg font-black text-sleek-dark uppercase">{productos.find((p: any) => p.id === selectedMov.productoId)?.nombre}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</p>
                <Badge variant={selectedMov.tipo === 'entrada' ? 'success' : selectedMov.tipo === 'salida' ? 'danger' : 'info'}>{selectedMov.tipo}</Badge>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cantidad</p>
                <p className="text-lg font-black text-sleek-dark">{formatNum(selectedMov.cantidad)} {selectedMov.unidad} ({formatNum(selectedMov.cantidadKg, 2)} kg)</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Almacén {selectedMov.tipo === 'entrada' ? 'Destino' : 'Origen'}</p>
                <p className="text-sm font-bold text-sleek-dark uppercase">{almacenes.find((a: any) => a.id === selectedMov.almacenId)?.nombre}</p>
              </div>
              {selectedMov.almacenDestinoId && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Almacén Destino</p>
                  <p className="text-sm font-bold text-sleek-dark uppercase">{almacenes.find((a: any) => a.id === selectedMov.almacenDestinoId)?.nombre}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lote</p>
                <p className="text-sm font-mono font-bold text-sleek-dark">{selectedMov.loteNumero}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Motivo</p>
                <p className="text-sm font-bold text-sleek-dark">{selectedMov.motivo}</p>
              </div>
              {selectedMov.proveedor && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Proveedor</p>
                  <p className="text-sm font-bold text-sleek-dark">{selectedMov.proveedor}</p>
                </div>
              )}
              {selectedMov.numeroFactura && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Documento</p>
                  <p className="text-sm font-bold text-sleek-dark">{selectedMov.numeroFactura}</p>
                </div>
              )}
              <div className="col-span-2 border-t border-slate-100 pt-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observaciones</p>
                <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded mt-1 italic">{selectedMov.observaciones || 'Sin observaciones'}</p>
              </div>
              {selectedMov.anulado && (
                <div className="col-span-2 bg-rose-50 border border-rose-100 p-4 rounded-xl mt-4">
                  <p className="text-xs font-black text-rose-500 uppercase tracking-widest mb-1">Movimiento Anulado</p>
                  <p className="text-[10px] font-bold text-rose-400">Anulado por {selectedMov.anuladoPor} el {safeFormat(selectedMov.anuladoFecha, 'dd/MM/yyyy HH:mm')} hs</p>
                </div>
              )}
            </div>
            <div className="flex justify-end pt-6 border-t border-slate-100">
              <button onClick={() => setIsModalOpen(false)} className="px-8 py-2 bg-slate-800 text-white rounded font-bold text-xs uppercase tracking-widest">Cerrar</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// --- Formularios de Movimientos ---

const EntradaForm = ({ productos, almacenes, unidades, getPesoEquivalente, currentUser, onSave, onClose, descuentosPendientes, setDescuentosPendientes }: any) => {
  const [formData, setFormData] = useState<any>({
    productoId: '',
    almacenId: '',
    cantidad: 0,
    motivo: 'Compra a proveedor',
    otroMotivo: '',
    loteNumero: '',
    fechaIngreso: safeFormat(new Date(), 'yyyy-MM-dd'),
    fechaVencimiento: '',
    proveedor: '',
    numeroFactura: '',
    costoUnitario: 0,
    observaciones: ''
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [showRegulizeAlert, setShowRegulizeAlert] = useState(false);
  const [currentPendientes, setCurrentPendientes] = useState<any[]>([]);

  const filteredProducts = productos.filter((p: any) => 
    p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.codigo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedProd = productos.find((p: any) => p.id === formData.productoId);
  const pesoEq = selectedProd ? getPesoEquivalente(selectedProd.id) : 1;

  useEffect(() => {
    if (formData.productoId) {
      const pId = formData.productoId;
      const pendientes = descuentosPendientes.filter((d: any) => d.productoId === pId);
      if (pendientes.length > 0) {
        setCurrentPendientes(pendientes);
        setShowRegulizeAlert(true);
      } else {
        setShowRegulizeAlert(false);
      }

      // Auto calcular vencimiento
      if (selectedProd?.vidaUtil?.valor) {
        const v = selectedProd.vidaUtil;
        const days = v.unidad === 'meses' ? v.valor * 30 : v.valor;
        setFormData(prev => ({ ...prev, fechaVencimiento: safeFormat(addDays(parseISO(formData.fechaIngreso), days), 'yyyy-MM-dd', '') }));
      }
    }
  }, [formData.productoId, formData.fechaIngreso, descuentosPendientes, selectedProd]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const units = unidades;
    const mov: Movimiento = {
      id: `MOV-${Date.now()}`,
      tipo: 'entrada',
      productoId: formData.productoId,
      almacenId: formData.almacenId,
      cantidad: formData.cantidad,
      unidad: units.find((u: any) => u.id === selectedProd?.unidadMedidaId)?.abreviatura || 'kg',
      cantidadKg: formData.cantidad * pesoEq,
      motivo: formData.motivo === 'Otro' ? formData.otroMotivo : formData.motivo,
      loteNumero: formData.loteNumero,
      fechaIngreso: formData.fechaIngreso,
      fechaVencimiento: formData.fechaVencimiento,
      proveedor: formData.proveedor,
      numeroFactura: formData.numeroFactura,
      costoUnitario: formData.costoUnitario || (selectedProd?.precioReferencia || 0),
      origen: 'manual',
      usuario: currentUser.name,
      fechaHora: new Date().toISOString(),
      anulado: false,
      observaciones: formData.observaciones
    };
    onSave(mov);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Escriba para buscar producto..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-sleek-accent"
            />
          </div>
          <select 
            required
            value={formData.productoId || ''}
            onChange={e => setFormData({ ...formData, productoId: e.target.value })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
          >
            <option value="">-- Seleccionar Producto * --</option>
            {filteredProducts.map((p: any) => (
              <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Almacén Destino *</label>
          <select 
            required
            value={formData.almacenId || ''}
            onChange={e => setFormData({ ...formData, almacenId: e.target.value })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
          >
            <option value="">Seleccionar...</option>
            {almacenes.map((a: any) => (
              <option key={a.id} value={a.id}>{a.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Cantidad ({selectedProd ? unidades.find((u: any) => u.id === selectedProd.unidadMedidaId)?.abreviatura : 'un'}) *</label>
          <input 
            type="number" 
            required
            step="0.001"
            value={formData.cantidad || ''}
            onChange={e => setFormData({ ...formData, cantidad: parseFloat(e.target.value) || 0 })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
          />
          {selectedProd && selectedProd.unidadMedidaId !== 'u1' && (
            <p className="text-[10px] font-bold text-sleek-accent mt-1 uppercase">Equivale a {(formData.cantidad * pesoEq).toFixed(2)} kg</p>
          )}
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Motivo *</label>
          <select 
            required
            value={formData.motivo || ''}
            onChange={e => setFormData({ ...formData, motivo: e.target.value })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
          >
            <option value="Compra a proveedor">Compra a proveedor</option>
            <option value="Devolución de cliente">Devolución de cliente</option>
            <option value="Ajuste de inventario (sobrante)">Ajuste de inventario (sobrante)</option>
            <option value="Otro">Otro</option>
          </select>
        </div>

        {formData.motivo === 'Otro' && (
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Especificar Motivo *</label>
            <input 
              type="text" required
              value={formData.otroMotivo || ''}
              onChange={e => setFormData({ ...formData, otroMotivo: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
            />
          </div>
        )}

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Nº Lote *</label>
          <input 
            type="text" required
            placeholder="Lote de proveedor o interno"
            value={formData.loteNumero || ''}
            onChange={e => setFormData({ ...formData, loteNumero: e.target.value })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono font-bold outline-none"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Fecha de Ingreso</label>
          <input 
            type="date"
            value={formData.fechaIngreso || ''}
            onChange={e => setFormData({ ...formData, fechaIngreso: e.target.value })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Fecha de Vencimiento *</label>
          <input 
            type="date" required
            value={formData.fechaVencimiento || ''}
            onChange={e => setFormData({ ...formData, fechaVencimiento: e.target.value })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
          />
        </div>

        <div className="md:col-span-2">
          {showRegulizeAlert && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-black text-amber-600 uppercase tracking-tight">Atención: Descuentos Pendientes</p>
                <p className="text-[10px] text-amber-500 font-bold uppercase mt-1">Este producto tiene {formatNum(currentPendientes.reduce((sum, p) => sum + p.cantidadPendiente, 0), 2)} kg pendientes de descontar por falta de stock en producciones anteriores.</p>
              </div>
            </div>
          )}
        </div>

        {formData.motivo === 'Compra a proveedor' && (
          <>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Proveedor</label>
              <input 
                type="text"
                value={formData.proveedor || ''}
                onChange={e => setFormData({ ...formData, proveedor: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
                placeholder="Nombre de la empresa"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Nº Factura / Remito</label>
              <input 
                type="text"
                value={formData.numeroFactura || ''}
                onChange={e => setFormData({ ...formData, numeroFactura: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Costo Unitario ($)</label>
              <input 
                type="number"
                value={formData.costoUnitario || ''}
                onChange={e => setFormData({ ...formData, costoUnitario: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
              />
            </div>
          </>
        )}

        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Observaciones</label>
          <textarea 
            value={formData.observaciones || ''}
            onChange={e => setFormData({ ...formData, observaciones: e.target.value })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm h-20 outline-none resize-none"
            placeholder="Alguna nota relevante..."
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-6 py-2 text-xs font-bold uppercase tracking-widest text-slate-400">Cancelar</button>
        <button type="submit" className="px-10 py-3 bg-sleek-success text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-emerald-600 transition-all shadow-lg active:scale-95">Registrar Entrada</button>
      </div>
    </form>
  );
};

const SalidaForm = ({ productos, almacenes, unidades, lotesStock, getPesoEquivalente, currentUser, onSave, onClose }: any) => {
  const [formData, setFormData] = useState<any>({
    productoId: '',
    almacenId: '',
    cantidad: 0,
    motivo: 'Venta',
    otroMotivo: '',
    referencia: '',
    observaciones: ''
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [availableLotes, setAvailableLotes] = useState<any[]>([]);

  const filteredProducts = productos.filter((p: any) => 
    p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.codigo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedProd = productos.find((p: any) => p.id === formData.productoId);
  const pesoEq = selectedProd ? getPesoEquivalente(selectedProd.id) : 1;
  const stockEnAlmacen = formData.almacenId ? lotesStock.filter((l: any) => l.productoId === formData.productoId && l.almacenId === formData.almacenId).reduce((sum: number, l: any) => sum + l.cantidad, 0) : 0;

  useEffect(() => {
    if (formData.productoId && formData.almacenId) {
      const lotes = lotesStock
        .filter((l: any) => l.productoId === formData.productoId && l.almacenId === formData.almacenId)
        .sort((a: any, b: any) => new Date(a.fechaVencimiento).getTime() - new Date(b.fechaVencimiento).getTime());
      
      setAvailableLotes(lotes.map((l: any) => ({ ...l, descontar: 0 })));
    }
  }, [formData.productoId, formData.almacenId, lotesStock]);

  // Aplicar FEFO automático al cambiar la cantidad
  useEffect(() => {
    if (formData.cantidad > 0 && availableLotes.length > 0) {
      let rest = formData.cantidad;
      const updated = availableLotes.map(l => {
        const take = Math.min(rest, l.cantidad);
        rest -= take;
        return { ...l, descontar: take };
      });
      setAvailableLotes(updated);
    }
  }, [formData.cantidad]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.cantidad > stockEnAlmacen) {
      globalAlert('Cantidad superior al stock disponible');
      return;
    }

    const totalADescontar = availableLotes.reduce((sum, l) => sum + l.descontar, 0);
    if (Math.abs(totalADescontar - formData.cantidad) > 0.001) {
      globalAlert('La suma de los lotes a descontar debe coincidir con la cantidad total.');
      return;
    }

    const newMovs: Movimiento[] = availableLotes.filter(l => l.descontar > 0).map(l => ({
      id: `MOV-${Date.now()}-${Math.random()}`,
      tipo: 'salida',
      productoId: formData.productoId,
      almacenId: formData.almacenId,
      cantidad: l.descontar,
      unidad: unidades.find((u: any) => u.id === selectedProd?.unidadMedidaId)?.abreviatura || 'kg',
      cantidadKg: l.descontar * pesoEq,
      motivo: formData.motivo === 'Otro' ? formData.otroMotivo : formData.motivo,
      loteNumero: l.numeroLote,
      fechaIngreso: safeFormat(new Date(), 'yyyy-MM-dd'),
      fechaVencimiento: l.fechaVencimiento,
      origen: 'manual',
      usuario: currentUser.name,
      fechaHora: new Date().toISOString(),
      anulado: false,
      referencia: formData.referencia,
      observaciones: formData.observaciones
    }));

    onSave(newMovs);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Escriba para buscar producto..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-sleek-accent"
            />
          </div>
          <select 
            required
            value={formData.productoId || ''}
            onChange={e => setFormData({ ...formData, productoId: e.target.value, almacenId: '' })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
          >
            <option value="">-- Seleccionar Producto * --</option>
            {filteredProducts.map((p: any) => (
              <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Almacén Origen *</label>
          <select 
            required
            value={formData.almacenId || ''}
            onChange={e => setFormData({ ...formData, almacenId: e.target.value })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
          >
            <option value="">Seleccionar...</option>
            {almacenes.map((a: any) => {
              const stockInA = lotesStock.filter((l: any) => l.productoId === formData.productoId && l.almacenId === a.id).reduce((sum: number, l: any) => sum + l.cantidad, 0);
              if (stockInA <= 0) return null;
              return <option key={a.id} value={a.id}>{a.nombre} (Dispo: {stockInA.toLocaleString()})</option>
            })}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Cantidad a Retirar *</label>
          <input 
            type="number" 
            required
            step="0.001"
            max={stockEnAlmacen}
            value={formData.cantidad || ''}
            onChange={e => setFormData({ ...formData, cantidad: parseFloat(e.target.value) || 0 })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
          />
          <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Stock Disponible: {stockEnAlmacen.toLocaleString()} {selectedProd ? unidades.find((u: any) => u.id === selectedProd.unidadMedidaId)?.abreviatura : 'un'}</p>
        </div>

        {availableLotes.length > 0 && (
          <div className="md:col-span-2 space-y-4">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Selección de Lotes (FEFO)</h4>
            <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-white border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2 font-bold uppercase">Lote</th>
                    <th className="px-4 py-2 text-right font-bold uppercase">Disponible</th>
                    <th className="px-4 py-2 text-center font-bold uppercase">Vencimiento</th>
                    <th className="px-4 py-2 text-right font-bold uppercase w-32">Descontar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {availableLotes.map((l, idx) => {
                    const isVencido = safeIsBefore(l.fechaVencimiento, new Date());
                    const isCerca = !isVencido && safeDiffDays(l.fechaVencimiento, new Date()) <= 7;
                    return (
                      <tr key={l.id} className={cn(isVencido && "bg-rose-50/50", l.descontar > 0 && "bg-amber-50/30")}>
                        <td className="px-4 py-3 font-mono font-bold text-sleek-dark">{l.numeroLote}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-500">{l.cantidad.toLocaleString()}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn(
                            "px-2 py-0.5 rounded font-bold",
                            isVencido ? "bg-rose-100 text-rose-600" : isCerca ? "bg-amber-100 text-amber-600" : "bg-emerald-50 text-emerald-600"
                          )}>
                            {safeFormat(l.fechaVencimiento, 'dd/MM/yy')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <input 
                            type="number"
                            step="0.001"
                            max={l.cantidad}
                            value={l.descontar || ''}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              const updated = [...availableLotes];
                              updated[idx].descontar = val;
                              setAvailableLotes(updated);
                            }}
                            className="w-full px-3 py-1 bg-white border border-slate-200 rounded text-right font-black"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Motivo *</label>
          <select 
            required
            value={formData.motivo || ''}
            onChange={e => setFormData({ ...formData, motivo: e.target.value })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
          >
            <option value="Venta">Venta</option>
            <option value="Consumo en producción">Consumo en producción</option>
            <option value="Descarte / Producto vencido">Descarte / Producto vencido</option>
            <option value="Merma / Rotura">Merma / Rotura</option>
            <option value="Ajuste de inventario (faltante)">Ajuste de inventario (faltante)</option>
            <option value="Otro">Otro</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Referencia</label>
          <input 
            type="text"
            value={formData.referencia || ''}
            onChange={e => setFormData({ ...formData, referencia: e.target.value })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
            placeholder="Nº Factura, Ticket, etc."
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Observaciones</label>
          <textarea 
            value={formData.observaciones || ''}
            onChange={e => setFormData({ ...formData, observaciones: e.target.value })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm h-20 outline-none resize-none"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-6 py-2 text-xs font-bold uppercase tracking-widest text-slate-400">Cancelar</button>
        <button type="submit" className="px-10 py-3 bg-sleek-danger text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-rose-600 transition-all shadow-lg">Registrar Salida</button>
      </div>
    </form>
  );
};

const TransferenciaForm = ({ productos, almacenes, unidades, lotesStock, getPesoEquivalente, currentUser, onSave, onClose }: any) => {
  const [formData, setFormData] = useState<any>({
    productoId: '',
    almacenId: '',
    almacenDestinoId: '',
    cantidad: 0,
    observaciones: ''
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [availableLotes, setAvailableLotes] = useState<any[]>([]);

  const filteredProducts = productos.filter((p: any) => 
    p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.codigo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedProd = productos.find((p: any) => p.id === formData.productoId);
  const pesoEq = selectedProd ? getPesoEquivalente(selectedProd.id) : 1;
  const stockEnAlmacen = formData.almacenId ? lotesStock.filter((l: any) => l.productoId === formData.productoId && l.almacenId === formData.almacenId).reduce((sum: number, l: any) => sum + l.cantidad, 0) : 0;

  useEffect(() => {
    if (formData.productoId && formData.almacenId) {
      const lotes = lotesStock
        .filter((l: any) => l.productoId === formData.productoId && l.almacenId === formData.almacenId)
        .sort((a: any, b: any) => new Date(a.fechaVencimiento).getTime() - new Date(b.fechaVencimiento).getTime());
      
      setAvailableLotes(lotes.map((l: any) => ({ ...l, descontar: 0 })));
    }
  }, [formData.productoId, formData.almacenId, lotesStock]);

  useEffect(() => {
    if (formData.cantidad > 0 && availableLotes.length > 0) {
      let rest = formData.cantidad;
      const updated = availableLotes.map(l => {
        const take = Math.min(rest, l.cantidad);
        rest -= take;
        return { ...l, descontar: take };
      });
      setAvailableLotes(updated);
    }
  }, [formData.cantidad]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.cantidad > stockEnAlmacen) {
      globalAlert('Stock insuficiente en origen');
      return;
    }
    if (formData.almacenId === formData.almacenDestinoId) {
      globalAlert('El almacén de destino no puede ser el mismo que el de origen.');
      return;
    }

    const refTrans = `TRANS-${Date.now()}`;
    const newMovs: Movimiento[] = availableLotes.filter(l => l.descontar > 0).flatMap((l: any) => {
      const base = {
        productoId: formData.productoId,
        cantidad: l.descontar,
        unidad: unidades.find((u: any) => u.id === selectedProd?.unidadMedidaId)?.abreviatura || 'kg',
        cantidadKg: l.descontar * pesoEq,
        motivo: 'Transferencia interna',
        loteNumero: l.numeroLote,
        fechaIngreso: safeFormat(new Date(), 'yyyy-MM-dd'),
        fechaVencimiento: l.fechaVencimiento,
        origen: 'manual' as const,
        usuario: currentUser.name,
        fechaHora: new Date().toISOString(),
        anulado: false,
        referencia: refTrans,
        observaciones: formData.observaciones
      };

      const sal: Movimiento = { ...base, id: `MOV-${Date.now()}-${Math.random()}`, tipo: 'salida', almacenId: formData.almacenId };
      const ent: Movimiento = { ...base, id: `MOV-${Date.now()}-${Math.random()}`, tipo: 'entrada', almacenId: formData.almacenDestinoId };
      
      return [sal, ent];
    });

    onSave(newMovs);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Buscar producto..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
            />
          </div>
          <select 
            required
            value={formData.productoId || ''}
            onChange={e => setFormData({ ...formData, productoId: e.target.value, almacenId: '' })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
          >
            <option value="">-- Seleccionar Producto * --</option>
            {filteredProducts.map((p: any) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Origen *</label>
          <select 
            required
            value={formData.almacenId || ''}
            onChange={e => setFormData({ ...formData, almacenId: e.target.value, almacenDestinoId: '' })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
          >
            <option value="">Seleccionar...</option>
            {almacenes.map((a: any) => {
              const stockInA = lotesStock.filter((l: any) => l.productoId === formData.productoId && l.almacenId === a.id).reduce((sum: number, l: any) => sum + l.cantidad, 0);
              if (stockInA <= 0) return null;
              return <option key={a.id} value={a.id}>{a.nombre} ({stockInA.toLocaleString()})</option>
            })}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Destino *</label>
          <select 
            required
            value={formData.almacenDestinoId || ''}
            onChange={e => setFormData({ ...formData, almacenDestinoId: e.target.value })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
          >
            <option value="">Seleccionar...</option>
            {almacenes.map((a: any) => (
              a.id !== formData.almacenId && <option key={a.id} value={a.id}>{a.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Cantidad *</label>
          <input 
            type="number" required step="0.001" max={stockEnAlmacen}
            value={formData.cantidad || ''}
            onChange={e => setFormData({ ...formData, cantidad: parseFloat(e.target.value) || 0 })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
          />
        </div>

        {availableLotes.length > 0 && (
          <div className="md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h4 className="text-[10px] font-black text-slate-400 uppercase mb-4">Lotes a transferir</h4>
            <div className="space-y-2">
              {availableLotes.map((l, idx) => (
                <div key={l.id} className="flex justify-between items-center text-[11px] p-2 bg-white rounded border border-slate-100">
                  <span className="font-mono font-bold">{l.numeroLote} (Vence: {safeFormat(l.fechaVencimiento, 'dd/MM/yy')})</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Descontar:</span>
                    <input 
                      type="number"
                      step="0.001"
                      max={l.cantidad}
                      value={l.descontar || ''}
                      onChange={e => {
                        const val = parseFloat(e.target.value) || 0;
                        const updated = [...availableLotes];
                        updated[idx].descontar = val;
                        setAvailableLotes(updated);
                      }}
                      className="w-20 px-2 py-0.5 border border-slate-200 rounded text-right font-bold"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Observaciones</label>
          <textarea 
            value={formData.observaciones || ''}
            onChange={e => setFormData({ ...formData, observaciones: e.target.value })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm h-20 outline-none resize-none"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-6 py-2 text-xs font-bold uppercase tracking-widest text-slate-400">Cancelar</button>
        <button type="submit" className="px-10 py-3 bg-sky-500 text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-sky-600 transition-all shadow-lg active:scale-95">Realizar Transferencia</button>
      </div>
    </form>
  );
};

const AsignarProductoForm = ({ almacenId, productos, onSave, onClose }: any) => {
  const [productoId, setProductoId] = useState('');
  const [cantidad, setCantidad] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredProducts = productos.filter((p: any) => 
    p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.codigo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productoId) return;
    onSave({ productoId, almacenId, cantidad });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Buscar Producto</label>
        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text"
            placeholder="Nombre o código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none transition-all"
          />
        </div>
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Seleccionar Producto</label>
        <select 
          required
          value={productoId}
          onChange={e => setProductoId(e.target.value)}
          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none transition-all"
        >
          <option value="">Seleccione un producto...</option>
          {filteredProducts.map((p: any) => (
            <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Stock de Seguridad Inicial</label>
        <input 
          type="number" 
          required
          min="0"
          value={cantidad || ''}
          onChange={e => setCantidad(parseFloat(e.target.value) || 0)}
          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none transition-all"
        />
      </div>
      <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-6 py-2 text-slate-500 font-bold text-xs uppercase tracking-widest hover:bg-slate-50 rounded transition-all">Cancelar</button>
        <button type="submit" className="px-8 py-2 bg-sleek-accent text-white font-bold text-xs uppercase tracking-widest rounded shadow-lg shadow-sleek-accent/20 hover:bg-amber-600 transition-all">Asignar Producto</button>
      </div>
    </form>
  );
};

const AlmacenesView = ({ 
  lotesEtiquetados,
  lotesStock, 
  productos, 
  getOcupacionAlmacen, 
  getStockActual, 
  getStockSeguridad, 
  getAlertasAlmacen,
  almacenes, 
  setModalType, 
  setIsModalOpen, 
  setEditingItem, 
  setAlmacenes, 
  showNotification,
  unidades,
  stockSeguridad,
  setStockSeguridad,
  getPesoEquivalente,
  lotesProduccion = [],
  lotesDespiece = []
}: any) => {
  const [selectedAlmacenId, setSelectedAlmacenId] = useState<string | null>(null);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [expandedLoteBoxes, setExpandedLoteBoxes] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTipo, setFilterTipo] = useState('Todos');
  const [filterEstado, setFilterEstado] = useState('Todos');

  const selectedAlmacen = almacenes.find((a: any) => a.id === selectedAlmacenId);

  if (selectedAlmacen) {
    const assignedProducts = stockSeguridad.filter((s: any) => s.almacenId === selectedAlmacen.id);
    const assignedProductIds = new Set(assignedProducts.map((ap: any) => ap.productoId));

    // Find products with stock in this almacen that are NOT assigned via stockSeguridad
    const unassignedWithStock = Array.from(new Set(
      lotesStock.filter((ls: any) => ls.almacenId === selectedAlmacen.id && ls.cantidad > 0.001 && !assignedProductIds.has(ls.productoId))
        .map((ls: any) => ls.productoId)
    )).map((pid: any) => ({ productoId: pid, cantidad: 0, almacenId: selectedAlmacen.id, _unassigned: true }));

    const allProducts = [...assignedProducts, ...unassignedWithStock];

    const filteredProducts = allProducts.filter((ap: any) => {
      const prod = productos.find((p: any) => p.id === ap.productoId);
      if (!prod) return false;
      
      const matchesSearch = prod.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           prod.codigo.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesTipo = filterTipo === 'Todos' || 
                         (filterTipo === 'MP' && prod.tipo === 'Materia Prima') || 
                         (filterTipo === 'PT' && prod.tipo === 'Producto Terminado');
      
      const actual = getStockActual(prod.id, selectedAlmacen.id);
      const seguridad = ap.cantidad;
      let status = 'gris';
      if (seguridad > 0) {
        if (actual < seguridad) status = 'rojo';
        else if (actual <= seguridad * 1.3) status = 'amarillo';
        else status = 'verde';
      }

      const matchesEstado = filterEstado === 'Todos' || 
                           (filterEstado === 'Con alerta' && (status === 'rojo' || status === 'amarillo')) ||
                           (filterEstado === 'Sin alerta' && status === 'verde');

      return matchesSearch && matchesTipo && matchesEstado;
    });

    const ocupacion = getOcupacionAlmacen(selectedAlmacen.id);
    const capacidad = selectedAlmacen.capacidadMax || 0;
    const porcentaje = capacidad > 0 ? Math.min(Math.round((ocupacion / capacidad) * 100), 100) : 0;
    const unidadCapacidad = unidades.find((u: any) => u.id === selectedAlmacen.capacidadUnidadId)?.abreviatura || 'kg';

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* Breadcrumb & Back */}
        <div className="flex flex-col gap-4">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            Inventario / Almacenes / <span className="text-sleek-accent">{selectedAlmacen.nombre}</span>
          </div>
          <button 
            onClick={() => setSelectedAlmacenId(null)}
            className="flex items-center gap-2 text-slate-500 hover:text-sleek-dark font-bold text-xs uppercase tracking-widest transition-all w-fit"
          >
            <ArrowLeft className="w-4 h-4" /> Volver a Almacenes
          </button>
        </div>

        {/* Header Card */}
        <Card className="p-8 border-t-8 border-sleek-accent">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-3xl font-black text-sleek-dark uppercase tracking-tighter">{selectedAlmacen.nombre}</h2>
                <Badge variant="info">{selectedAlmacen.tipoAlmacenamiento}</Badge>
              </div>
              <div className="flex items-center gap-4 text-slate-400 font-bold text-[10px] uppercase tracking-widest">
                <span className="flex items-center gap-1">
                  <Thermometer className="w-3 h-3" /> {selectedAlmacen.tempMin || 0}°C a {selectedAlmacen.tempMax || 0}°C
                </span>
                <span>•</span>
                <span>{selectedAlmacen.descripcion}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => { setEditingItem(selectedAlmacen); setModalType('ALMACEN_FORM'); setIsModalOpen(true); }}
                className="px-6 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded font-bold text-xs uppercase tracking-widest transition-all flex items-center gap-2"
              >
                <Edit2 className="w-4 h-4" /> Editar Almacén
              </button>
              <button 
                onClick={() => { setEditingItem({ almacenId: selectedAlmacen.id }); setModalType('ASIGNAR_PRODUCTO_FORM'); setIsModalOpen(true); }}
                className="px-6 py-2 bg-sleek-dark hover:bg-slate-800 text-white rounded font-bold text-xs uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-sleek-dark/20"
              >
                <Plus className="w-4 h-4" /> Agregar Producto
              </button>
            </div>
          </div>

          <div className="bg-slate-50 p-6 rounded-xl border border-slate-100">
            <div className="flex justify-between items-end mb-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Ocupación Total</p>
              <p className="text-sm font-black text-sleek-dark">
                {(ocupacion || 0).toLocaleString()} {unidadCapacidad} / {(capacidad || 0).toLocaleString()} {unidadCapacidad} ({porcentaje}%)
              </p>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-4 overflow-hidden border border-slate-300">
              <div 
                className={cn(
                  "h-full transition-all duration-1000",
                  porcentaje > 90 ? "bg-sleek-danger" : porcentaje > 70 ? "bg-sleek-warning" : "bg-sleek-success"
                )}
                style={{ width: `${porcentaje}%` }}
              />
            </div>
          </div>
        </Card>

        {/* Table Filters */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Buscar por nombre o código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sleek-accent outline-none transition-all"
            />
          </div>
          <div className="flex gap-4 w-full md:w-auto">
            <select 
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value)}
              className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold uppercase tracking-widest text-slate-500 outline-none focus:ring-2 focus:ring-sleek-accent"
            >
              <option value="Todos">Todos los Tipos</option>
              <option value="MP">Materia Prima</option>
              <option value="PT">Producto Terminado</option>
            </select>
            <select 
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
              className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold uppercase tracking-widest text-slate-500 outline-none focus:ring-2 focus:ring-sleek-accent"
            >
              <option value="Todos">Todos los Estados</option>
              <option value="Con alerta">Con Alerta</option>
              <option value="Sin alerta">Sin Alerta</option>
            </select>
          </div>
        </div>

        {/* Products Table */}
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Producto</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Stock Actual</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Stock Seguridad</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Estado</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Lotes</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center text-slate-300">
                    <Package className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="font-bold uppercase tracking-widest">No se encontraron productos</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((ap: any) => {
                  const prod = productos.find((p: any) => p.id === ap.productoId);
                  const actual = getStockActual(prod.id, selectedAlmacen.id);
                  const seguridad = ap.cantidad;
                  const prodLotes = lotesStock.filter((l: any) => l.productoId === prod.id && l.almacenId === selectedAlmacen.id);
                  const prodUnidad = unidades.find((u: any) => u.id === prod.unidadMedidaId)?.abreviatura || '';
                  
                  let status = 'gris';
                  if (seguridad > 0) {
                    if (actual < seguridad) status = 'rojo';
                    else if (actual <= seguridad * 1.3) status = 'amarillo';
                    else status = 'verde';
                  }

                  return (
                    <React.Fragment key={ap.productoId}>
                      <tr className={cn("hover:bg-slate-50 transition-colors", expandedProduct === ap.productoId && "bg-slate-50/50")}>
                        <td className="px-6 py-4">
                          <p className="font-black text-sleek-dark uppercase tracking-tight">{prod.nombre}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">{prod.codigo}</p>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={prod.tipo === 'Materia Prima' ? 'info' : 'success'}>
                            {prod.tipo === 'Materia Prima' ? 'MP' : 'PT'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <p className="font-mono font-bold text-sleek-dark">
                            {prod.tipo === 'Materia Prima' 
                              ? displayNum(prodLotes.reduce((sum: number, l: any) => sum + (l.cantidad * getPesoEquivalente(prod.id, l)), 0), 2) 
                              : displayNum(actual || 0, 2)} {prod.tipo === 'Materia Prima' ? 'kg' : prodUnidad}
                          </p>
                          {prod.tipo === 'Materia Prima' && prodUnidad !== 'kg' && (
                            <p className="text-[10px] text-slate-400">({displayNum(actual || 0, 1)} {prodUnidad})</p>
                          )}
                          {prod.tipo === 'Producto Terminado' && prodUnidad !== 'kg' && (
                            <p className="text-[10px] text-slate-400">({displayNum(prodLotes.reduce((sum: number, l: any) => sum + (l.cantidad * getPesoEquivalente(prod.id, l)), 0), 2)} kg)</p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <p className="font-mono text-slate-500 text-sm">
                            {seguridad > 0 ? (
                              prod.tipo === 'Materia Prima' 
                                ? `${formatNum(seguridad * getPesoEquivalente(prod.id))} kg`
                                : `${formatNum(seguridad || 0)} ${prodUnidad}`
                            ) : '-'}
                          </p>
                          {seguridad > 0 && prod.tipo === 'Materia Prima' && prodUnidad !== 'kg' && (
                            <p className="text-[10px] text-slate-400">({formatNum(seguridad || 0)} {prodUnidad})</p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className={cn(
                            "w-3 h-3 rounded-full mx-auto shadow-sm",
                            status === 'rojo' ? "bg-sleek-danger animate-pulse" : 
                            status === 'amarillo' ? "bg-sleek-warning" : 
                            status === 'verde' ? "bg-sleek-success" : "bg-slate-300"
                          )} title={status === 'rojo' ? 'Bajo Stock' : status === 'amarillo' ? 'Cerca del Límite' : 'Stock OK'} />
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button 
                            onClick={() => setExpandedProduct(expandedProduct === ap.productoId ? null : ap.productoId)}
                            className="px-3 py-1 bg-white border border-slate-200 rounded-full text-[10px] font-black text-slate-500 hover:border-sleek-accent hover:text-sleek-accent transition-all flex items-center gap-1 mx-auto"
                          >
                            {prodLotes.length} LOTES
                            {expandedProduct === ap.productoId ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => { setEditingItem(ap); setModalType('STOCK_SEGURIDAD_FORM'); setIsModalOpen(true); }}
                              className="p-2 hover:bg-slate-200 rounded text-slate-400 hover:text-sleek-accent transition-all"
                              title="Configurar Stock de Seguridad"
                            >
                              <Settings className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => {
                                if (actual > 0) {
                                  showNotification('No se puede quitar. Hay stock actual.', 'error');
                                  return;
                                }
                                confirmDialog('¿Quitar este producto del almacén?', () => {
                                  setStockSeguridad(stockSeguridad.filter((s: any) => !(s.productoId === ap.productoId && s.almacenId === selectedAlmacen.id)));
                                  showNotification('Producto quitado del almacén', 'success');
                                });
                              }}
                              className="p-2 hover:bg-slate-200 rounded text-slate-400 hover:text-sleek-danger transition-all"
                              title="Quitar del Almacén"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedProduct === ap.productoId && (
                        <tr>
                          <td colSpan={7} className="px-6 py-0 bg-slate-50/30">
                            <div className="py-4 px-8 border-l-4 border-sleek-accent my-2">
                              <table className="w-full text-left text-[11px]">
                                <thead>
                                  <tr className="text-slate-400 font-black uppercase tracking-widest border-b border-slate-200">
                                    <th className="py-2">N° Lote</th>
                                    <th className="py-2 text-right">Cantidad</th>
                                    <th className="py-2 text-center">Ingreso</th>
                                    <th className="py-2 text-center">Vencimiento</th>
                                    <th className="py-2 text-right">Estado</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {prodLotes.length === 0 ? (
                                    <tr>
                                      <td colSpan={5} className="py-4 text-center text-slate-400 italic">Sin lotes registrados</td>
                                    </tr>
                                  ) : (
                                    prodLotes.map((lote: any) => {
                                      const hoy = new Date();
                                      const venc = parseISO(lote.fechaVencimiento);
                                      const isExpired = safeIsBefore(lote.fechaVencimiento, hoy);
                                      const isNear = !isExpired && safeDiffDays(lote.fechaVencimiento, hoy) <= 7;
                                      
                                      return (
                                        <React.Fragment key={lote.id}>
                                          <tr>
                                            <td className="py-3 font-mono font-bold text-sleek-dark">{lote.numeroLote}</td>
                                            <td className="py-3 text-right font-mono font-bold text-sleek-dark">
                                              {prod.tipo === 'Materia Prima' 
                                                ? `${displayNum((lote.cantidad || 0) * getPesoEquivalente(prod.id, lote), 2)} kg`
                                                : `${displayNum(lote.cantidad || 0, 1)} ${prodUnidad}`}
                                            </td>
                                            <td className="py-3 text-center text-slate-500">{safeFormat(lote.fechaIngreso, 'dd/MM/yyyy')}</td>
                                            <td className="py-3 text-center text-slate-500">{safeFormat(venc, 'dd/MM/yyyy')}</td>
                                            <td className="py-3 text-right">
                                              {prod.tipo === 'Producto Terminado' && prodUnidad !== 'kg' && (
                                                <p className="text-[10px] text-slate-400 mt-1">({displayNum((lote.cantidad || 0) * getPesoEquivalente(prod.id, lote), 2)} kg)</p>
                                              )}
                                              <div className="flex justify-end items-center gap-2">
                                                <button 
                                                  onClick={() => setExpandedLoteBoxes(expandedLoteBoxes === lote.id ? null : lote.id)}
                                                  className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-sleek-accent transition-all flex items-center gap-1 text-[9px] font-black uppercase tracking-widest"
                                                  title="Ver Cajas"
                                                >
                                                  <Package className="w-3 h-3" /> Ver Cajas
                                                </button>
                                                <Badge variant={isExpired ? 'danger' : isNear ? 'warning' : 'success'}>
                                                  {isExpired ? 'Vencido' : isNear ? 'Próximo' : 'Vigente'}
                                                </Badge>
                                              </div>
                                            </td>
                                          </tr>
                                          {expandedLoteBoxes === lote.id && (
                                            <tr>
                                              <td colSpan={5} className="py-0">
                                                <div className="bg-white m-4 rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                                                  {(() => {
                                                    // 1. Diagnosis tools (Robust lookup)
                                                    const targetLoteNum = lote.numeroLote;
                                                    const targetLoteId = lote.id; // This is the ls-p1-a1-L001 ID

                                                    // 2. Try to find the internal production/butchery ID from the human-readable number
                                                    const internalProdLote = lotesProduccion.find((lp: any) => lp.numeroLote === targetLoteNum);
                                                    const internalDespieceLote = lotesDespiece.find((ld: any) => ld.numeroLote === targetLoteNum);
                                                    const internalId = internalProdLote?.id || internalDespieceLote?.id;

                                                    console.log("=== DEBUG VER CAJAS ===");
                                                    console.log("Lote buscado (stock):", targetLoteNum);
                                                    console.log("Internal ID inferido:", internalId);
                                                    console.log("Lotes Etiquetados (prop):", lotesEtiquetados);
                                                    console.log("Todas las claves en localStorage:", Object.keys(localStorage));

                                                    // 3. ROBUST MATCHING
                                                    const le = lotesEtiquetados.find((item: any) => {
                                                      const matchesNumero = item.loteNumero === targetLoteNum;
                                                      const matchesId = item.loteId === targetLoteNum;
                                                      const matchesInternalId = internalId && (item.loteId === internalId || item.parentLoteId === internalId);
                                                      const matchesRawId = item.loteId === targetLoteId;
                                                      
                                                      // Specialized butchery matching (e.g., lp1-pt1)
                                                      const butcheryPartMatch = internalId && item.loteId?.startsWith(`${internalId}-`);

                                                      return matchesNumero || matchesId || matchesInternalId || matchesRawId || butcheryPartMatch;
                                                    });
                                                    
                                                    // Filter containers that are actually in stock (not 'baja')
                                                    const activeEnvases = (le?.envases || []).filter((e: any) => 
                                                      (e.estado === 'en_stock' || !e.estado) && !(e.anulado === true || e.anulado === 'true')
                                                    );

                                                    if (activeEnvases.length === 0) {
                                                      return <div className="p-8 text-center text-slate-400 text-[10px] font-bold uppercase tracking-widest bg-slate-50/50 italic">
                                                        Este lote no tiene cajas individuales registradas. El stock se cargó como cantidad total.
                                                      </div>;
                                                    }

                                                    const totalPeso = activeEnvases.reduce((sum: number, e: any) => sum + e.pesoNeto, 0);

                                                    return (
                                                      <div className="animate-in fade-in slide-in-from-top-2">
                                                        <table className="w-full text-left">
                                                          <thead className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                                            <tr>
                                                              <th className="px-6 py-3">Nº Envase</th>
                                                              <th className="px-6 py-3">Código de Barras</th>
                                                              <th className="px-6 py-3 text-right">Peso Neto</th>
                                                            </tr>
                                                          </thead>
                                                          <tbody className="divide-y divide-slate-50 text-[10px]">
                                                            {activeEnvases.map((env: any, eidx: number) => (
                                                              <tr key={eidx} className={cn("hover:bg-slate-50/50 transition-colors")}>
                                                                <td className="px-6 py-2 font-bold text-slate-400">#{env.numero}</td>
                                                                <td className="px-6 py-2 font-mono font-bold text-sleek-dark lowercase text-[9px]">{env.codigoBarras}</td>
                                                                <td className="px-6 py-2 text-right font-mono font-bold text-sleek-dark">{formatNum(env.pesoNeto, 3)} kg</td>
                                                              </tr>
                                                            ))}
                                                          </tbody>
                                                          <tfoot className="bg-sleek-dark text-white text-[9px] font-black uppercase tracking-widest">
                                                            <tr>
                                                              <td colSpan={2} className="px-6 py-3 text-right">Total cajas en stock: {activeEnvases.length}</td>
                                                              <td className="px-6 py-3 text-right">Peso total: {formatNum(totalPeso, 2)} kg</td>
                                                            </tr>
                                                          </tfoot>
                                                        </table>
                                                      </div>
                                                    );
                                                  })()}
                                                </div>
                                              </td>
                                            </tr>
                                          )}
                                        </React.Fragment>
                                      );
                                    })
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-black text-sleek-dark uppercase tracking-widest">Gestión de Almacenes</h2>
        <button 
          onClick={() => { setModalType('ALMACEN_FORM'); setIsModalOpen(true); setEditingItem(null); }}
          className="bg-sleek-dark hover:bg-slate-800 text-white px-8 py-3 rounded-lg font-bold text-xs uppercase tracking-widest transition-all flex items-center gap-2 shadow-xl shadow-sleek-dark/20"
        >
          <Plus className="w-5 h-5" /> Nuevo Almacén
        </button>
      </div>

      {almacenes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 bg-white rounded-2xl border border-dashed border-slate-300 text-slate-400">
          <Thermometer className="w-16 h-16 mb-6 opacity-20" />
          <p className="text-lg font-bold uppercase tracking-widest">No hay almacenes creados</p>
          <p className="text-xs mt-2">Hacé clic en '+ Nuevo Almacén' para crear el primero.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {almacenes.map((almacen: any) => {
            const ocupacion = getOcupacionAlmacen(almacen.id);
            const porcentaje = Math.min(Math.round((ocupacion / almacen.capacidadMax) * 100), 100);
            const unidadCapacidad = unidades.find((u: any) => u.id === almacen.capacidadUnidadId)?.abreviatura || 'kg';
            const alertas = getAlertasAlmacen(almacen.id);
            const stockLotes = lotesStock.filter((l: any) => l.almacenId === almacen.id);
            const distinctProds = new Set(stockLotes.map((l: any) => l.productoId)).size;

            return (
              <div key={almacen.id}>
                <Card className="p-0 flex flex-col h-full border-t-4 border-sleek-accent">
                  <div className="p-6 flex-1">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-black text-sleek-dark uppercase tracking-tight leading-tight mb-1">{almacen.nombre}</h3>
                        <Badge variant="info">{almacen.tipoAlmacenamiento}</Badge>
                      </div>
                      <div className="flex gap-1">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setEditingItem(almacen); setModalType('ALMACEN_FORM'); setIsModalOpen(true); }}
                          className="p-2 hover:bg-slate-100 rounded text-slate-400 hover:text-sleek-accent transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation();
                            if (ocupacion > 0) {
                              showNotification('No se puede eliminar. Hay productos almacenados.', 'error');
                              return;
                            }
                            confirmDialog('¿Está seguro de eliminar este almacén?', () => {
                              setAlmacenes(almacenes.filter((a: any) => a.id !== almacen.id));
                              showNotification('Almacén eliminado', 'success');
                            });
                          }}
                          className="p-2 hover:bg-slate-100 rounded text-slate-400 hover:text-sleek-danger transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-6">
                      <Thermometer className="w-3 h-3" /> {almacen.tempMin}°C a {almacen.tempMax}°C
                    </div>

                    <div className="mb-6">
                      <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest mb-2">
                        <span className="text-slate-400">Ocupación</span>
                        <span className="text-sleek-dark">{(ocupacion || 0).toLocaleString()} / {(almacen.capacidadMax || 0).toLocaleString()} {unidadCapacidad}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                        <div 
                          className={cn(
                            "h-full transition-all duration-500",
                            porcentaje > 90 ? "bg-sleek-danger" : porcentaje > 70 ? "bg-sleek-warning" : "bg-sleek-success"
                          )}
                          style={{ width: `${porcentaje}%` }}
                        />
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">
                        {distinctProds} productos almacenados
                      </p>
                    </div>

                    <div className="space-y-2 border-t border-slate-100 pt-4">
                      {alertas.stockBajo > 0 && (
                        <div className="flex items-center gap-2 text-sleek-danger font-bold text-[10px] uppercase tracking-widest">
                          <div className="w-2 h-2 rounded-full bg-sleek-danger animate-pulse" />
                          {alertas.stockBajo} productos bajo stock de seguridad
                        </div>
                      )}
                      {alertas.proximosVencer > 0 && (
                        <div className="flex items-center gap-2 text-sleek-warning font-bold text-[10px] uppercase tracking-widest">
                          <div className="w-2 h-2 rounded-full bg-sleek-warning" />
                          {alertas.proximosVencer} lotes próximos a vencer
                        </div>
                      )}
                      {alertas.stockBajo === 0 && alertas.proximosVencer === 0 && (
                        <div className="flex items-center gap-2 text-sleek-success font-bold text-[10px] uppercase tracking-widest">
                          <CheckCircle2 className="w-3 h-3" /> Sin alertas
                        </div>
                      )}
                    </div>
                  </div>

                  <button 
                    onClick={() => setSelectedAlmacenId(almacen.id)}
                    className="w-full py-4 bg-slate-50 hover:bg-sleek-dark hover:text-white text-sleek-dark font-black rounded-b-xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest border-t border-slate-100"
                  >
                    <Eye className="w-4 h-4" /> Ver Detalle
                  </button>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// --- Ventas Components ---

const VentasPedidosView = ({ 
  ventas, setVentas, clientes, listasPrecios, puntosVenta, productos, 
  lotesStock, movimientos, setMovimientos, lotesEtiquetados, setLotesEtiquetados,
  unidades, almacenes, currentUser, showNotification 
}: any) => {
  const [view, setView] = useState<'list' | 'form' | 'print'>('list');
  const [selectedVenta, setSelectedVenta] = useState<any>(null);
  const [editingVenta, setEditingVenta] = useState<any>(null);
  const [isAnnulModalOpen, setIsAnnulModalOpen] = useState(false);
  const [ventaToAnnul, setVentaToAnnul] = useState<any>(null);
  const [isRemitoOpen, setIsRemitoOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // List Filters
  const [dateRange, setDateRange] = useState({ 
    from: safeFormat(new Date(), 'yyyy-MM-dd'), 
    to: safeFormat(new Date(), 'yyyy-MM-dd') 
  });
  const [filterCliente, setFilterCliente] = useState('Todos');
  const [filterEstado, setFilterEstado] = useState('Todos');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredVentas = useMemo(() => {
    return ventas.filter((v: any) => {
      const matchDate = (!dateRange.from || v.fecha >= dateRange.from) && (!dateRange.to || v.fecha <= dateRange.to);
      const matchCliente = filterCliente === 'Todos' || v.clienteId === filterCliente;
      const matchEstado = filterEstado === 'Todos' || v.estado === filterEstado;
      const cliente = clientes.find((c: any) => c.id === v.clienteId);
      const matchSearch = v.comprobante.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (cliente?.razonSocial || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchDate && matchCliente && matchEstado && matchSearch;
    }).sort((a: any, b: any) => b.fecha.localeCompare(a.fecha));
  }, [ventas, dateRange, filterCliente, filterEstado, searchTerm, clientes]);

  const handleCreateNew = () => {
    const today = new Date();
    const vtaId = `VTA-${safeFormat(today, 'yyyyMMdd')}-${(ventas.length + 1).toString().padStart(3, '0')}`;
    setEditingVenta({
      id: vtaId,
      comprobante: vtaId,
      puntoVentaId: puntosVenta[0]?.id || '',
      clienteId: '',
      sucursalId: '',
      fecha: safeFormat(today, 'yyyy-MM-dd'),
      estado: 'En Proceso',
      productos: [],
      subtotal: 0,
      descuentoGeneral: 0,
      tipoDescuentoGeneral: '$',
      total: 0,
      cobros: [],
      totalCobrado: 0,
      saldoPendiente: 0,
      estadoCobro: 'Pendiente',
      observaciones: '',
      usuario: currentUser.name,
      fechaCreacion: new Date().toISOString()
    });
    setView('form');
  };

  const handleEdit = (venta: any) => {
    // Abrir el modal con los datos precargados. No tocamos los movimientos todavía (Alternativa Recomendada).
    setEditingVenta(JSON.parse(JSON.stringify(venta)));
    setView('form');
  };

  const handleDelete = (venta: any) => {
    confirmDialog(`¿Estás seguro de eliminar el pedido ${venta.comprobante}? Esta acción no se puede deshacer.`, () => {
      setVentas(ventas.filter((v: any) => v.id !== venta.id));
      showNotification(`Pedido ${venta.comprobante} eliminado.`, 'success');
    });
  };

  const handleAnnulClick = (venta: any) => {
    setVentaToAnnul(venta);
    setIsAnnulModalOpen(true);
  };

  const executeAnnul = (venta: any) => {
    if (!venta) return;
    setIsSubmitting(true);

    // 1. Anular movimientos de stock asociados
    const updatedMovimientos = movimientos.map((m: any) => 
      m.referencia === venta.comprobante ? { ...m, anulado: true, anuladoPor: currentUser.name, anuladoFecha: new Date().toISOString() } : m
    );

    // 2. Revertir estado de envases si hubo
    const envaseBarcodes = venta.productos.filter((p: any) => p.codigoBarras).map((p: any) => p.codigoBarras);
    const updatedLotesEtiquetados = lotesEtiquetados.map((le: any) => ({
      ...le,
      envases: le.envases.map((e: any) => 
        envaseBarcodes.includes(e.codigoBarras) ? { ...e, estado: 'en_stock', ventaId: null } : e
      )
    }));

    // 3. Cambiar estado de la venta y anular cobros
    const updatedVentas = ventas.map((v: any) => v.id === venta.id ? { 
      ...v, 
      estado: 'Anulado',
      cobros: [],
      totalCobrado: 0,
      saldoPendiente: 0,
      estadoCobro: 'Anulado'
    } : v);

    setMovimientos(updatedMovimientos);
    setLotesEtiquetados(updatedLotesEtiquetados);
    setVentas(updatedVentas);
    
    setIsAnnulModalOpen(false);
    setVentaToAnnul(null);
    setIsSubmitting(false);
    showNotification(`Venta ${venta.comprobante} anulada. Stock revertido.`, 'success');
  };

  if (view === 'form') {
    return (
      <VentaForm 
        venta={editingVenta}
        onClose={() => setView('list')}
        onSave={(savedVenta: any, shouldFinalize: boolean) => {
          // If editing a finalized sale, we must annul old moves first
          let finalMovimientos = [...movimientos];
          const oldVenta = ventas.find((v: any) => v.id === savedVenta.id);
          
          if (oldVenta && oldVenta.estado === 'Finalizado') {
             finalMovimientos = finalMovimientos.map((m: any) => 
               m.referencia === oldVenta.comprobante ? { ...m, anulado: true, anuladoPor: currentUser.name, anuladoFecha: new Date().toISOString() } : m
             );
             // Revert envases status
             const oldBarcodes = oldVenta.productos.filter((p: any) => p.codigoBarras).map((p: any) => p.codigoBarras);
             if (oldBarcodes.length > 0) {
                setLotesEtiquetados(lotesEtiquetados.map((le: any) => ({
                  ...le,
                  envases: le.envases.map((e: any) => oldBarcodes.includes(e.codigoBarras) ? { ...e, estado: 'en_stock' } : e)
                })));
             }
          }

          if (shouldFinalize) {
            // Logic to discount stock
            const newMovs: Movimiento[] = [];
            const updatedLE = JSON.parse(JSON.stringify(lotesEtiquetados));

            savedVenta.productos.forEach((item: any) => {
              if (item.codigoBarras) {
                // Specific Package
                let found = false;
                updatedLE.forEach((le: any) => {
                  const env = le.envases.find((e: any) => e.codigoBarras === item.codigoBarras);
                  if (env) {
                    env.estado = 'Vendido';
                    env.ventaId = savedVenta.id;
                    found = true;
                    
                    newMovs.push({
                      id: `MOV-${Date.now()}-${item.codigoBarras}`,
                      tipo: 'salida',
                      productoId: item.productoId,
                      almacenId: le.almacenDestinoId || 'a2',
                      cantidad: item.cantidad,
                      unidad: item.unidad,
                      cantidadKg: item.unidad === 'kg' ? item.cantidad : (item.cantidad * (productos.find((p: any) => p.id === item.productoId)?.pesoNetoUnidad || 0)),
                      motivo: `Venta ${savedVenta.comprobante}`,
                      loteNumero: le.loteNumero,
                      fechaIngreso: safeFormat(new Date(), 'yyyy-MM-dd'),
                      fechaVencimiento: '',
                      origen: 'manual',
                      usuario: currentUser.name,
                      fechaHora: new Date().toISOString(),
                      anulado: false,
                      referencia: savedVenta.comprobante,
                      observaciones: `Envase: ${item.codigoBarras}`
                    });
                  }
                });
              } else {
                // FEFO manual - track stock per lote AND per almacen
                let pending = item.cantidad;
                const prod = productos.find((p: any) => p.id === item.productoId);
                const isKg = prod?.unidadMedidaId === 'u1';
                
                // Get stock per lote+almacen combination
                const stockPorLoteAlmacen: any = {};
                finalMovimientos.filter((m: any) => !m.anulado && m.productoId === item.productoId).forEach((m: any) => {
                  const key = `${m.loteNumero}|||${m.almacenId}`;
                  const cant = m.tipo === 'entrada' ? m.cantidad : (m.tipo === 'salida' ? -m.cantidad : 0);
                  stockPorLoteAlmacen[key] = (stockPorLoteAlmacen[key] || 0) + cant;
                });

                // Build batches with almacen info, sorted FEFO
                const batches = Object.keys(stockPorLoteAlmacen)
                  .map(key => {
                    const [num, almId] = key.split('|||');
                    const entry = finalMovimientos.find((m: any) => m.productoId === item.productoId && m.loteNumero === num && m.tipo === 'entrada');
                    return { numero: num, almacenId: almId, stock: stockPorLoteAlmacen[key], vencimiento: entry?.fechaVencimiento || '9999-12-31' };
                  })
                  .filter(b => b.stock > 0.001)
                  .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));

                batches.forEach(b => {
                  if (pending <= 0) return;
                  const toTake = Math.min(pending, b.stock);
                  newMovs.push({
                    id: `MOV-${Date.now()}-${b.numero}-${pending}`,
                    tipo: 'salida',
                    productoId: item.productoId,
                    almacenId: b.almacenId, // Use the actual almacen where stock exists
                    cantidad: toTake,
                    unidad: item.unidad,
                    cantidadKg: isKg ? toTake : (toTake * (prod?.pesoNetoUnidad || 0)),
                    motivo: `Venta ${savedVenta.comprobante}`,
                    loteNumero: b.numero,
                    fechaIngreso: safeFormat(new Date(), 'yyyy-MM-dd'),
                    fechaVencimiento: b.vencimiento,
                    origen: 'manual',
                    usuario: currentUser.name,
                    fechaHora: new Date().toISOString(),
                    anulado: false,
                    referencia: savedVenta.comprobante,
                    observaciones: 'Descuento por FEFO (Venta Manual)'
                  });
                  pending -= toTake;
                });

                if (pending > 0) {
                  // Finalizing with negative stock warning
                  const defaultAlmacen = batches.length > 0 ? batches[0].almacenId : 'a1';
                   newMovs.push({
                    id: `MOV-${Date.now()}-neg-${pending}`,
                    tipo: 'salida',
                    productoId: item.productoId,
                    almacenId: defaultAlmacen,
                    cantidad: pending,
                    unidad: item.unidad,
                    cantidadKg: isKg ? pending : (pending * (prod?.pesoNetoUnidad || 0)),
                    motivo: `Venta ${savedVenta.comprobante}`,
                    loteNumero: 'STK-NEGATIVO',
                    fechaIngreso: safeFormat(new Date(), 'yyyy-MM-dd'),
                    fechaVencimiento: '',
                    origen: 'manual',
                    usuario: currentUser.name,
                    fechaHora: new Date().toISOString(),
                    anulado: false,
                    referencia: savedVenta.comprobante,
                    observaciones: 'Stock insuficiente (Salida forzada)'
                  });
                }
              }
            });

            setMovimientos([...newMovs, ...finalMovimientos]);
            setLotesEtiquetados(updatedLE);
            showNotification(`Venta ${savedVenta.comprobante} finalizada. Stock descontado.`, 'success');
          } else {
            setMovimientos(finalMovimientos);
            showNotification(`Pedido ${savedVenta.comprobante} guardado como borrador.`, 'info');
          }

          if (ventas.find((v: any) => v.id === savedVenta.id)) {
            setVentas(ventas.map((v: any) => v.id === savedVenta.id ? savedVenta : v));
          } else {
            setVentas([savedVenta, ...ventas]);
          }
          setView('list');
        }}
        clientes={clientes}
        productos={productos}
        listasPrecios={listasPrecios}
        puntosVenta={puntosVenta}
        lotesEtiquetados={lotesEtiquetados}
        setLotesEtiquetados={setLotesEtiquetados}
        almacenes={almacenes}
        movimientos={movimientos}
        setMovimientos={setMovimientos}
        ventas={ventas}
        showNotification={showNotification}
      />
    );
  }

  if (view === 'print' && selectedVenta) {
     return (
       <RemitoView 
         venta={selectedVenta} 
         cliente={clientes.find((c: any) => c.id === selectedVenta.clienteId)}
         productos={productos}
         onBack={() => setView('list')}
       />
     );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-sleek-dark uppercase tracking-widest">Ventas y Pedidos</h1>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Gestión de operaciones comerciales y logística de despacho</p>
        </div>
        <button 
          onClick={handleCreateNew}
          className="bg-amber-500 hover:bg-amber-600 text-white px-8 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-xl hover:shadow-2xl flex items-center gap-3"
        >
          <Plus className="w-6 h-6" /> Nueva Venta / Pedido
        </button>
      </div>

      <Card className="p-6 bg-white/50 border-none shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1">
             <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Desde</label>
             <input 
               type="date" 
               value={dateRange.from}
               onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
               className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl focus:ring-2 focus:ring-sleek-accent outline-none text-xs font-bold"
             />
          </div>
          <div className="space-y-1">
             <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Hasta</label>
             <input 
               type="date" 
               value={dateRange.to}
               onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
               className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl focus:ring-2 focus:ring-sleek-accent outline-none text-xs font-bold"
             />
          </div>
          <div className="space-y-1">
             <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Cliente</label>
             <select 
               value={filterCliente}
               onChange={(e) => setFilterCliente(e.target.value)}
               className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl focus:ring-2 focus:ring-sleek-accent outline-none text-xs font-black uppercase text-slate-500"
             >
               <option value="Todos">Todos los Clientes</option>
               {clientes.map((c: any) => <option key={c.id} value={c.id}>{c.razonSocial}</option>)}
             </select>
          </div>
          <div className="space-y-1">
             <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado</label>
             <select 
               value={filterEstado}
               onChange={(e) => setFilterEstado(e.target.value)}
               className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl focus:ring-2 focus:ring-sleek-accent outline-none text-xs font-black uppercase text-slate-500"
             >
                <option value="Todos">Todos los Estados</option>
                <option value="En Proceso">En Proceso</option>
                <option value="Finalizado">Finalizado</option>
                <option value="Anulado">Anulado</option>
             </select>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar por comprobante, cliente o producto..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white border border-slate-100 rounded-2xl focus:ring-2 focus:ring-sleek-accent outline-none text-sm font-bold text-slate-700 transition-all shadow-inner"
          />
        </div>
      </Card>

      <Card className="overflow-hidden border-none shadow-xl rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-5 text-left text-[10px] font-black uppercase text-slate-400 tracking-widest">Fecha</th>
                <th className="px-8 py-5 text-left text-[10px] font-black uppercase text-slate-400 tracking-widest">Nº Comprobante</th>
                <th className="px-8 py-5 text-left text-[10px] font-black uppercase text-slate-400 tracking-widest">Cliente</th>
                <th className="px-8 py-5 text-left text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Items</th>
                <th className="px-8 py-5 text-right text-[10px] font-black uppercase text-slate-400 tracking-widest">Total</th>
                <th className="px-8 py-5 text-center text-[10px] font-black uppercase text-slate-400 tracking-widest">Estado</th>
                <th className="px-8 py-5 text-center text-[10px] font-black uppercase text-slate-400 tracking-widest">Cobro</th>
                <th className="px-8 py-5 text-right text-[10px] font-black uppercase text-slate-400 tracking-widest"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredVentas.map((venta: any) => {
                const cliente = clientes.find((c: any) => c.id === venta.clienteId);
                const sucursal = cliente?.sucursales.find((s: any) => s.id === venta.sucursalId);
                
                return (
                  <tr key={venta.id} className={cn(
                    "hover:bg-slate-50/50 transition-all group",
                    venta.estado === 'Anulado' && "opacity-40 grayscale-[0.5]"
                  )}>
                    <td className="px-8 py-5">
                      <p className="text-[11px] font-bold text-slate-500">{safeFormat(venta.fecha, 'dd/MM/yyyy')}</p>
                    </td>
                    <td className="px-8 py-5">
                      <p className="text-[11px] font-black text-sleek-dark uppercase">{venta.comprobante}</p>
                    </td>
                    <td className="px-8 py-5">
                      <p className="text-[11px] font-black text-sleek-dark uppercase">{cliente?.razonSocial || 'Desconocido'}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{sucursal?.nombre || '-'}</p>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <Badge variant="default">{venta.productos.length} productos</Badge>
                    </td>
                    <td className="px-8 py-5 text-right font-black text-sleek-dark text-[11px]">
                      $ {venta.total.toLocaleString()}
                    </td>
                    <td className="px-8 py-5 text-center">
                      <Badge variant={venta.estado === 'Finalizado' ? 'success' : venta.estado === 'Anulado' ? 'danger' : 'info'}>
                        {venta.estado}
                      </Badge>
                    </td>
                    <td className="px-8 py-5 text-center">
                      {venta.estado === 'Finalizado' ? (
                        <Badge variant={venta.estadoCobro === 'Cobrado' ? 'success' : venta.estadoCobro === 'Parcial' ? 'warning' : 'default'}>
                          {venta.estadoCobro}
                        </Badge>
                      ) : <span className="text-[10px] text-slate-300">-</span>}
                    </td>
                    <td className="px-8 py-5 text-right">
                       <div className="flex justify-end gap-2">
                         <button onClick={() => { setSelectedVenta(venta); setIsRemitoOpen(true); }} className="p-2 text-slate-400 hover:text-sleek-accent transition-all" title="Ver / Imprimir">
                            <Eye className="w-4 h-4" />
                         </button>
                         {venta.estado !== 'Anulado' && (
                           <button onClick={() => handleEdit(venta)} className="p-2 text-slate-400 hover:text-sky-600 transition-all" title="Editar">
                             <Edit2 className="w-4 h-4" />
                           </button>
                         )}
                         {venta.estado === 'En Proceso' && (
                            <button onClick={() => handleDelete(venta)} className="p-2 text-slate-400 hover:text-sleek-danger transition-all" title="Eliminar">
                               <Trash2 className="w-4 h-4" />
                            </button>
                         )}
                         {venta.estado === 'Finalizado' && (
                            <button onClick={() => handleAnnulClick(venta)} className="p-2 text-slate-400 hover:text-sleek-danger transition-all" title="Anular">
                               <XCircle className="w-4 h-4" />
                            </button>
                         )}
                       </div>
                    </td>
                  </tr>
                );
              })}
              {filteredVentas.length === 0 && (
                <tr>
                   <td colSpan={8} className="px-8 py-20 text-center text-slate-300">
                      <Package className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      <p className="text-sm font-bold uppercase tracking-widest italic">No se registran operaciones en este período</p>
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal de Remito / Comprobante */}
      {isRemitoOpen && selectedVenta && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-[95%] h-[95%] flex flex-col overflow-hidden animate-in zoom-in-95 shadow-2xl relative">
            <div className="h-14 bg-sleek-dark flex items-center justify-between px-6 shrink-0">
              <div className="flex items-center gap-4">
                <Printer className="w-4 h-4 text-sleek-accent" />
                <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Vista Previa de Comprobante</h3>
              </div>
              <button 
                onClick={() => setIsRemitoOpen(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-all group"
              >
                <X className="w-5 h-5 text-white/50 group-hover:text-white" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <RemitoView 
                venta={selectedVenta} 
                cliente={clientes.find((c: any) => c.id === selectedVenta.clienteId)}
                productos={productos}
                onBack={() => setIsRemitoOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal de Anulación */}
      {isAnnulModalOpen && ventaToAnnul && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white rounded-3xl p-8 w-full max-w-md animate-in zoom-in-95 shadow-2xl">
              <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-6 mx-auto">
                 <XCircle className="w-8 h-8 text-rose-500" />
              </div>
              <h3 className="text-sm font-black uppercase tracking-[0.2em] mb-4 text-center text-sleek-dark">Confirmar Anulación</h3>
              <p className="text-[10px] text-slate-500 font-bold text-center leading-relaxed mb-8 uppercase tracking-widest leading-loose">
                ¿Estás seguro de anular la venta <span className="text-sleek-dark font-black tracking-normal text-xs">{ventaToAnnul.comprobante}</span> por <span className="text-sleek-dark text-lg font-black block mt-2 mb-2 tracking-normal">$ {ventaToAnnul.total.toLocaleString()}</span> al cliente <span className="text-sleek-dark font-black tracking-normal">{clientes.find((c: any) => c.id === ventaToAnnul.clienteId)?.razonSocial}</span>?<br/><br/>
                El stock se revertirá y los envases volverán a estar disponibles. Los cobros de esta venta serán anulados.
              </p>
              <div className="flex gap-4 self-stretch">
                 <button 
                   disabled={isSubmitting}
                   onClick={() => setIsAnnulModalOpen(false)} 
                   className="flex-1 py-4 font-black uppercase text-[9px] tracking-widest text-slate-400 disabled:opacity-50"
                 >
                   Cancelar
                 </button>
                 <button 
                   disabled={isSubmitting}
                   onClick={() => executeAnnul(ventaToAnnul)} 
                   className="flex-2 py-4 bg-rose-500 text-white font-black rounded-2xl uppercase text-[9px] tracking-widest shadow-xl transition-all hover:bg-rose-600 disabled:opacity-50"
                 >
                    {isSubmitting ? 'Procesando...' : 'Confirmar Anulación'}
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const VentaForm = ({ 
  venta, onClose, onSave, clientes, productos, listasPrecios, 
  puntosVenta, lotesEtiquetados, setLotesEtiquetados, almacenes, 
  movimientos, setMovimientos, ventas, showNotification 
}: any) => {
  const [form, setForm] = useState(venta);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [isCobroModalOpen, setIsCobroModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Bug 2: Return states
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnItemIdx, setReturnItemIdx] = useState<number | null>(null);
  const [returnAlmacenId, setReturnAlmacenId] = useState('');
  const [newCobro, setNewCobro] = useState<Cobro>({
    monto: 0,
    metodo: 'Efectivo',
    fecha: safeFormat(new Date(), 'yyyy-MM-dd'),
    observaciones: ''
  });
  
  // Bug 5: Scanner vs Tipping logic
  const lastKeyTime = useRef<number>(0);
  const isScanning = useRef<boolean>(false);

  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  const selectedCliente = useMemo(() => clientes.find((c: any) => c.id === form.clienteId), [form.clienteId, clientes]);
  const currentLista = useMemo(() => listasPrecios.find((lp: any) => lp.id === selectedCliente?.listaPrecioId), [selectedCliente, listasPrecios]);

  const saldoPendienteGlobal = useMemo(() => {
    if (!selectedCliente) return 0;
    return ventas
      .filter((v: any) => v.clienteId === selectedCliente.id && v.estado === 'Finalizado' && v.id !== form.id)
      .reduce((sum: number, v: any) => sum + v.saldoPendiente, 0);
  }, [selectedCliente, ventas, form.id]);

  const totalActual = useMemo(() => {
    const sub = form.productos.reduce((sum: number, p: any) => sum + p.subtotal, 0);
    const desc = form.tipoDescuentoGeneral === '%' ? (sub * (form.descuentoGeneral / 100)) : form.descuentoGeneral;
    return Math.max(0, sub - desc);
  }, [form.productos, form.descuentoGeneral, form.tipoDescuentoGeneral]);

  const getPriceForQuantity = (productoId: string, quantity: number, allItems: any[]) => {
    const listProduct = currentLista?.productos.find((lp: any) => lp.productoId === productoId);
    if (!listProduct) return 0;
    
    // Suma de cantidades para este producto (el carrito completo gatilla la escala)
    const totalQty = allItems
      .filter((item: any) => item.productoId === productoId)
      .reduce((sum: number, item: any) => sum + (item.cantidad || 0), 0);

    if (listProduct.escalas && listProduct.escalas.length > 0) {
      const scale = listProduct.escalas.find((s: any) => totalQty >= s.desde && (s.hasta === 0 || totalQty <= s.hasta));
      if (scale) return scale.precio;
    }
    
    return listProduct.precio;
  };

  const saldoExcedido = useMemo(() => {
    if (!selectedCliente || selectedCliente.condicionPago !== 'Cuenta Corriente' || !selectedCliente.topeCredito) return false;
    return (saldoPendienteGlobal + totalActual) > selectedCliente.topeCredito;
  }, [selectedCliente, saldoPendienteGlobal, totalActual]);

  const updateTotals = (newItems: any[]) => {
    // BUG 112: Precios por Escala - Sincronizar precios automáticos
    const syncedItems = newItems.map((item: any) => {
      // Si el precio NO es manual, recalculamos basado en la escala actual (volumen total del carrito)
      if (!item.manualPrice) {
        const autoPrice = getPriceForQuantity(item.productoId, item.cantidad, newItems);
        const sub = (item.cantidad * autoPrice) * (1 - item.descuento / 100);
        return { ...item, precioUnitario: autoPrice, subtotal: sub };
      }
      return item;
    });

    const sub = syncedItems.reduce((sum: number, p: any) => sum + p.subtotal, 0);
    const desc = form.tipoDescuentoGeneral === '%' ? (sub * (form.descuentoGeneral / 100)) : form.descuentoGeneral;
    const tot = Math.max(0, sub - desc);
    const pendingCharge = tot - form.totalCobrado || 0;
    
    setForm({
      ...form,
      productos: syncedItems,
      subtotal: sub,
      total: tot,
      saldoPendiente: Math.max(0, pendingCharge),
      estadoCobro: form.totalCobrado === 0 ? 'Pendiente' : (pendingCharge <= 0 ? 'Cobrado' : 'Parcial')
    });
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput) return;

    // Check if it exists in tagged lots
    let foundPackage = null;
    let foundLote = null;
    lotesEtiquetados.forEach((le: any) => {
      const p = le.envases.find((env: any) => env.codigoBarras === barcodeInput);
      if (p) {
        foundPackage = p;
        foundLote = le;
      }
    });

    if (foundPackage) {
      const p: any = foundPackage;
      if (p.estado === 'Baja' || p.anulado) {
        showNotification('Este envase fue dado de baja o anulado', 'error');
      } else if (form.productos.some((item: any) => item.codigoBarras === barcodeInput)) {
        showNotification('Este envase ya está en la venta', 'error');
      } else {
        const prod = productos.find((p_obj: any) => p_obj.id === foundLote?.productoId);
        const isKg = prod?.unidadMedidaId === 'u1';
        // Si el producto se vende por kg, la cantidad es el peso. Si se vende por unidad, la cantidad es 1.
        const cantidadVenta = isKg ? p.pesoNeto : 1;
        const price = getPriceForQuantity(prod?.id || '', cantidadVenta, [...form.productos]);
        const discountObj = selectedCliente?.descuentosEspeciales.find((d: any) => d.productoId === prod?.id);
        const discount = discountObj ? discountObj.porcentaje : 0;
        
        const sub = (cantidadVenta * price) * (1 - discount / 100);
        const newItem: VentaProducto = {
          productoId: prod?.id || '',
          codigoBarras: barcodeInput,
          cantidad: cantidadVenta,
          unidad: isKg ? 'kg' : 'un',
          precioUnitario: price,
          descuento: discount,
          subtotal: sub,
          manualPrice: false,
          pesoKg: p.pesoNeto  // Always store weight for reference
        };
        updateTotals([...form.productos, newItem]);
        showNotification('Envase agregado', 'success');
      }
    } else {
      // Not a barcode, trigger manual search if visible or show error
      showNotification('Código de barras no encontrado', 'error');
    }
    setBarcodeInput('');
  };

  const addManualItem = (prod: any) => {
    const price = getPriceForQuantity(prod.id, 0, [...form.productos]);
    const discountObj = selectedCliente?.descuentosEspeciales.find((d: any) => d.productoId === prod.id);
    const discount = discountObj ? discountObj.porcentaje : 0;

    const newItem: VentaProducto = {
      productoId: prod.id,
      codigoBarras: null,
      cantidad: 0,
      unidad: prod.unidadMedidaId === 'u1' ? 'kg' : 'un',
      precioUnitario: price,
      descuento: discount,
      subtotal: 0,
      manualPrice: false
    };
    updateTotals([...form.productos, newItem]);
    setShowSearch(false);
  };

  const removeLine = (idx: number) => {
    // BUG 2: Logica de devolucion si la venta esta finalizada
    if (form.estado === 'Finalizado') {
       setReturnItemIdx(idx);
       // Pre-select PT warehouse as default
       setReturnAlmacenId('a2'); 
       setIsReturnModalOpen(true);
    } else {
       const news = [...form.productos];
       news.splice(idx, 1);
       updateTotals(news);
    }
  };

  const handleConfirmReturn = () => {
    if (returnItemIdx === null || !returnAlmacenId) return;

    const item = form.productos[returnItemIdx];
    const prod = productos.find((p: any) => p.id === item.productoId);
    
    // 1. Si es envase, volver a en_stock
    if (item.codigoBarras) {
      setLotesEtiquetados(lotesEtiquetados.map((le: any) => ({
        ...le,
        envases: le.envases.map((e: any) => 
          e.codigoBarras === item.codigoBarras ? { ...e, estado: 'en_stock', ventaId: null } : e
        )
      })));
    }

    // 2. Generar movimiento de entrada
    const newMov: Movimiento = {
      id: `MOV-DEV-${Date.now()}`,
      tipo: 'entrada',
      productoId: item.productoId,
      almacenId: returnAlmacenId,
      cantidad: item.cantidad,
      unidad: item.unidad,
      cantidadKg: item.unidad === 'kg' ? item.cantidad : (item.cantidad * (prod?.pesoNetoUnidad || 0)),
      motivo: `Devolución por edición de venta ${form.comprobante}`,
      loteNumero: item.codigoBarras ? (lotesEtiquetados.find((le: any) => le.envases.some((e: any) => e.codigoBarras === item.codigoBarras))?.loteNumero || 'DEV-VAR') : 'DEV-MANUAL',
      fechaIngreso: safeFormat(new Date(), 'yyyy-MM-dd'),
      fechaVencimiento: '',
      origen: 'manual',
      usuario: form.usuario,
      fechaHora: new Date().toISOString(),
      anulado: false,
      referencia: form.comprobante,
      observaciones: `Devolución de item quitado ${item.codigoBarras ? `(Envase: ${item.codigoBarras})` : '(Manual)'}`
    };

    setMovimientos([newMov, ...movimientos]);

    // 3. Quitar de la tabla
    const news = [...form.productos];
    news.splice(returnItemIdx, 1);
    updateTotals(news);

    setIsReturnModalOpen(false);
    setReturnItemIdx(null);
    showNotification(`Producto devuelto a ${almacenes.find((a: any) => a.id === returnAlmacenId)?.nombre}. Stock actualizado.`, 'success');
  };

  const updateLine = (idx: number, field: string, value: any) => {
    const news = [...form.productos];
    let manualPrice = news[idx].manualPrice;
    
    // Si el usuario edita el precio unitario directamente, marcamos como manual para romper la escala
    if (field === 'precioUnitario') {
      manualPrice = true;
    }
    
    news[idx] = { ...news[idx], [field]: value, manualPrice };
    // Recalculate subtotal
    news[idx].subtotal = (news[idx].cantidad * news[idx].precioUnitario) * (1 - news[idx].descuento / 100);
    updateTotals(news);
  };

  const handleAddCobro = () => {
    if (newCobro.monto <= 0) return;
    const totalCob = form.totalCobrado + newCobro.monto;
    const pending = Math.max(0, form.total - totalCob);
    const updatedForm = {
      ...form,
      cobros: [...form.cobros, newCobro],
      totalCobrado: totalCob,
      saldoPendiente: pending,
      estadoCobro: totalCob === 0 ? 'Pendiente' : (pending <= 0 ? 'Cobrado' : 'Parcial')
    };
    setForm(updatedForm);
    setIsCobroModalOpen(false);
    setNewCobro({ monto: 0, metodo: 'Efectivo', fecha: safeFormat(new Date(), 'yyyy-MM-dd'), observaciones: '' });
  };

  const removeCobro = (idx: number) => {
    const cob = form.cobros[idx];
    const totalCob = form.totalCobrado - cob.monto;
    const pending = form.total - totalCob;
    const updatedForm = {
      ...form,
      cobros: form.cobros.filter((_: any, i: number) => i !== idx),
      totalCobrado: totalCob,
      saldoPendiente: pending,
      estadoCobro: totalCob === 0 ? 'Pendiente' : (pending <= 0 ? 'Cobrado' : 'Parcial')
    };
    setForm(updatedForm);
  };

  const handleClose = () => {
    // If form has modifications or products
    const isModified = form.productos.length > 0 || form.clienteId !== '' || form.observaciones !== '';
    if (isModified) {
      confirmDialog('¿Descartar los cambios? Los datos ingresados se perderán.', () => {
        onClose();
      });
      return;
    }
    onClose();
  };

  const handleFinalizeClick = () => {
    if (!form.clienteId) {
      showNotification('Debes seleccionar un cliente', 'error');
      return;
    }
    if (!form.sucursalId) {
       showNotification('Debes seleccionar una sucursal', 'error');
       return;
    }
    if (form.productos.length === 0) {
      showNotification('La venta no tiene productos', 'error');
      return;
    }
    if (form.productos.some((p: any) => p.cantidad <= 0)) {
      showNotification('Todos los productos deben tener cantidad mayor a 0', 'error');
      return;
    }
    
    setIsConfirmModalOpen(true);
  };

  const executeSave = (isFinal: boolean) => {
    setIsSubmitting(true);
    onSave({ ...form, estado: isFinal ? 'Finalizado' : 'En Proceso' }, isFinal);
    // Modal will close because list view is updated or step ends
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
        <div className="absolute inset-0 bg-sleek-dark/80 backdrop-blur-sm" onClick={handleClose}></div>
        
        <div className="relative w-full h-full bg-slate-50 rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-300">
            {/* Header toolbar */}
            <div className="h-16 bg-sleek-dark flex items-center justify-between px-8 text-white shadow-2xl z-10 shrink-0">
              <div className="flex items-center gap-6">
                <h1 className="text-sm font-black uppercase tracking-[0.3em]">{venta.id ? 'Gestionar Operación' : 'NUEVA VENTA / PEDIDO'}</h1>
              </div>
              <button 
                onClick={handleClose} 
                className="p-2 hover:bg-white/10 rounded-full transition-all close-btn" 
                data-action="cerrar-modal-venta"
                title="Cerrar (Esc)"
              >
                <X className="w-5 h-5 text-white/50 hover:text-white" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
               <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 pb-20">
              <div className="lg:col-span-2 space-y-8">
                 <Card className="p-8">
                    <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                       <LayoutDashboard className="w-4 h-4 text-sleek-accent" /> Datos Generales
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nº Comprobante</label>
                          <input type="text" value={form.comprobante} onChange={(e) => setForm({ ...form, comprobante: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg outline-none font-black text-slate-600" />
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Punto de Venta *</label>
                          <select value={form.puntoVentaId} onChange={(e) => setForm({ ...form, puntoVentaId: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg outline-none font-bold text-slate-600">
                             {puntosVenta.map((pv: any) => <option key={pv.id} value={pv.id}>{pv.nombre}</option>)}
                          </select>
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente *</label>
                          <select 
                            value={form.clienteId} 
                            onChange={(e) => {
                              const c = clientes.find((cli: any) => cli.id === e.target.value);
                              setForm({ 
                                ...form, 
                                clienteId: e.target.value, 
                                sucursalId: c?.sucursales.length === 1 ? c.sucursales[0].id : ''
                              });
                            }} 
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg outline-none font-black text-sleek-dark"
                          >
                             <option value="">Seleccionar Cliente...</option>
                             {clientes.filter((c: any) => c.estado === 'Activo').map((c: any) => <option key={c.id} value={c.id}>{c.razonSocial}</option>)}
                          </select>
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sucursal *</label>
                          <select 
                            disabled={!form.clienteId}
                            value={form.sucursalId} 
                            onChange={(e) => setForm({ ...form, sucursalId: e.target.value })} 
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg outline-none font-bold text-slate-600 disabled:opacity-50"
                          >
                             <option value="">Seleccionar Sucursal...</option>
                             {selectedCliente?.sucursales.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                          </select>
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</label>
                          <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg outline-none font-bold text-slate-600" />
                       </div>
                       <div className="flex items-center gap-4">
                          <div className="p-3 bg-slate-100 rounded-xl flex-1">
                             <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Lista de Precios</p>
                             <p className="text-[10px] font-black text-sleek-dark uppercase">{currentLista?.nombre || 'Ninguna'}</p>
                          </div>
                          <div className="p-3 bg-slate-100 rounded-xl flex-1">
                             <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Pago</p>
                             <p className="text-[10px] font-black text-sleek-dark uppercase">{selectedCliente?.condicionPago || '-'}</p>
                          </div>
                       </div>
                    </div>
                 </Card>

                 <Card className="p-8 border-t-8 border-sleek-accent">
                    <div className="bg-slate-100 p-6 rounded-2xl mb-8 flex items-center gap-6 relative">
                       <Barcode className="w-8 h-8 text-slate-400" />
                       <div className="flex-1">
                          <form onSubmit={handleBarcodeSubmit}>
                            <input 
                              ref={barcodeInputRef}
                              type="text" 
                              placeholder="Escanear bulto o escribir código..." 
                              value={barcodeInput}
                              autoComplete="off"
                              onKeyDown={(e: any) => {
                                const now = Date.now();
                                const diff = now - lastKeyTime.current;
                                lastKeyTime.current = now;
                                if (diff < 80) isScanning.current = true;
                                else if (e.key === 'Backspace' || e.key.length > 1) {
                                  isScanning.current = false;
                                }
                                
                                if (e.key === 'Escape') {
                                  setShowSearch(false);
                                  setBarcodeInput('');
                                }
                              }}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBarcodeInput(val);
                                
                                if (!val) {
                                  setShowSearch(false);
                                  isScanning.current = false;
                                  return;
                                }

                                const isBarcodePattern = val.includes('-') && /\d/.test(val);
                                
                                if (isScanning.current || isBarcodePattern) {
                                  setShowSearch(false);
                                } else if (val.length > 2) {
                                  setShowSearch(true);
                                } else {
                                  setShowSearch(false);
                                }
                              }}
                              onBlur={() => {
                                setTimeout(() => setShowSearch(false), 250);
                              }}
                              className="w-full bg-transparent border-none outline-none font-black text-xl placeholder:text-slate-300 placeholder:italic"
                            />
                          </form>
                          {showSearch && (
                            <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-2xl border border-slate-100 z-50 max-h-60 overflow-y-auto custom-scrollbar p-2">
                               {productos.filter((p: any) => p.nombre.toLowerCase().includes(barcodeInput.toLowerCase()) || p.codigo.toLowerCase().includes(barcodeInput.toLowerCase())).map((p: any) => (
                                 <button key={p.id} onClick={() => addManualItem(p)} className="w-full text-left p-3 hover:bg-slate-50 rounded-lg flex items-center justify-between group transition-all">
                                    <div>
                                      <p className="text-xs font-black text-sleek-dark uppercase group-hover:text-sleek-accent">{p.nombre}</p>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase">{p.codigo}</p>
                                    </div>
                                    <Plus className="w-4 h-4 text-slate-200 group-hover:text-sleek-accent" />
                                 </button>
                               ))}
                            </div>
                          )}
                       </div>
                       <div className="bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200">
                          <p className="text-[8px] font-black text-slate-400 uppercase">Modo Automático</p>
                          <p className="text-[10px] font-black text-emerald-500 uppercase">Detectado</p>
                       </div>
                    </div>

                    <table className="w-full">
                       <thead>
                         <tr className="border-b border-slate-100">
                            <th className="text-left py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Producto</th>
                            <th className="text-left py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Bulto / Cant.</th>
                            <th className="text-right py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Precio Unit.</th>
                            <th className="text-center py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-center gap-1"><Tag className="w-3 h-3" /> %</th>
                            <th className="text-right py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Subtotal</th>
                            <th className="text-right py-4 w-10"></th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-50">
                          {form.productos.map((item: any, idx: number) => {
                             const p = productos.find((prod: any) => prod.id === item.productoId);
                             return (
                               <tr key={idx} className="group hover:bg-slate-50/50 transition-all">
                                  <td className="py-4 font-black text-xs text-sleek-dark uppercase">
                                    {p?.nombre}
                                    {item.codigoBarras && <p className="text-[9px] text-slate-400 font-bold tracking-tight italic">ID: {item.codigoBarras}</p>}
                                  </td>
                                  <td className="py-4">
                                     <div className="flex items-center gap-2">
                                        <input 
                                          type="number" 
                                          disabled={!!item.codigoBarras}
                                          value={item.cantidad}
                                          onChange={(e) => updateLine(idx, 'cantidad', parseFloat(e.target.value) || 0)}
                                          className="w-20 px-2 py-1 bg-white border border-slate-100 rounded text-xs font-black text-center outline-none disabled:bg-slate-100 disabled:text-slate-400 shadow-inner"
                                        />
                                        <span className="text-[10px] font-black text-slate-400 uppercase">{item.unidad}</span>
                                        {item.pesoKg && item.unidad !== 'kg' && (
                                          <span className="text-[9px] font-bold text-slate-300">({formatNum(item.pesoKg, 2)} kg)</span>
                                        )}
                                     </div>
                                  </td>
                                  <td className="py-4 text-right">
                                     <div className="relative inline-block">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 text-[10px]">$</span>
                                        <input 
                                          type="number" 
                                          value={item.precioUnitario}
                                          onChange={(e) => updateLine(idx, 'precioUnitario', parseFloat(e.target.value) || 0)}
                                          className={cn(
                                            "w-24 pl-5 pr-2 py-1 bg-white border border-slate-100 rounded text-xs font-black text-right outline-none shadow-inner",
                                            item.manualPrice && "border-amber-300 ring-1 ring-amber-100"
                                          )}
                                        />
                                        <div className="absolute -top-3 -right-1 flex gap-1">
                                          {!item.manualPrice && (currentLista?.productos.find((lp: any) => lp.productoId === item.productoId)?.escalas?.length || 0) > 0 && (
                                            <div title="Precio por Escala Aplicado" className="bg-amber-500 text-white rounded-full p-0.5 shadow-sm transform hover:scale-110 transition-all">
                                              <Layers className="w-2.5 h-2.5" />
                                            </div>
                                          )}
                                          {item.manualPrice && (
                                            <button 
                                              onClick={() => {
                                                 const news = [...form.productos];
                                                 news[idx] = { ...news[idx], manualPrice: false };
                                                 updateTotals(news);
                                              }}
                                              title="Volver a precio de lista/escala" 
                                              className="bg-sky-500 text-white rounded-full p-0.5 shadow-sm hover:bg-sky-600 transition-all"
                                            >
                                               <History className="w-2.5 h-2.5" />
                                            </button>
                                          )}
                                        </div>
                                        {item.manualPrice && (
                                          <span className="absolute -bottom-3 right-0 text-[7px] font-black uppercase text-amber-600 tracking-tighter">Manual</span>
                                        )}
                                     </div>
                                  </td>
                                  <td className="py-4 text-center">
                                     <input 
                                       type="number" 
                                       value={item.descuento}
                                       onChange={(e) => updateLine(idx, 'descuento', parseFloat(e.target.value) || 0)}
                                       className="w-16 px-1 py-1 bg-white border border-slate-100 rounded text-xs font-black text-center outline-none shadow-inner"
                                     />
                                  </td>
                                  <td className="py-4 text-right font-black text-xs text-sleek-dark">
                                     $ {item.subtotal.toLocaleString()}
                                  </td>
                                  <td className="py-4 text-right">
                                     <button onClick={() => removeLine(idx)} className="p-2 text-slate-300 hover:text-sleek-danger transition-all opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                                  </td>
                               </tr>
                             );
                          })}
                          {form.productos.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-12 text-center text-slate-300 font-bold uppercase italic text-[10px]">Sin productos cargados</td>
                            </tr>
                          )}
                       </tbody>
                    </table>
                 </Card>
              </div>

              <div className="space-y-8">
                 <Card className="p-8 bg-sleek-dark text-white sticky top-8">
                    <h2 className="text-xs font-black text-white/40 uppercase tracking-[0.2em] mb-8">Resumen de Venta</h2>
                    <div className="space-y-4 mb-8">
                       <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-white/60">
                          <span>Subtotal</span>
                          <span>$ {form.subtotal.toLocaleString()}</span>
                       </div>
                       <div className="flex justify-between items-center gap-4">
                          <span className="text-xs font-bold uppercase tracking-widest text-white/60">Descuento Gral.</span>
                          <div className="flex gap-2 items-center">
                             <select value={form.tipoDescuentoGeneral} onChange={(e) => setForm({ ...form, tipoDescuentoGeneral: e.target.value })} className="bg-white/10 p-1 rounded text-[10px] font-black outline-none">
                                <option value="$">$</option>
                                <option value="%">%</option>
                             </select>
                             <input 
                               type="number" 
                               value={form.descuentoGeneral} 
                               onChange={(e) => {
                                 const val = parseFloat(e.target.value) || 0;
                                 setForm({ ...form, descuentoGeneral: val });
                                 // Recalculate total immediately for display
                                 const sub = form.subtotal;
                                 const desc = form.tipoDescuentoGeneral === '%' ? (sub * (val / 100)) : val;
                                 const tot = Math.max(0, sub - desc);
                                 setForm(f => ({ ...f, descuentoGeneral: val, total: tot, saldoPendiente: Math.max(0, tot - f.totalCobrado) }));
                               }}
                               className="bg-white/10 w-20 px-2 py-1 rounded text-right font-black outline-none text-xs" 
                             />
                          </div>
                       </div>
                       <div className="pt-6 border-t border-white/10 flex justify-between items-baseline">
                          <span className="text-xs font-black uppercase tracking-[.3em] text-sleek-accent">TOTAL A PAGAR</span>
                          <span className="text-3xl font-black text-white leading-none tracking-tight">$ {form.total.toLocaleString()}</span>
                       </div>
                    </div>

                    {saldoExcedido && (
                       <div className="p-4 bg-amber-500/20 border-l-4 border-amber-500 rounded-lg text-amber-500 mb-8 animate-pulse text-[10px] font-bold leading-relaxed uppercase tracking-widest">
                          ⚠️ Excede tope de crédito ({selectedCliente?.topeCredito.toLocaleString()}). Saldo hoy: {saldoPendienteGlobal.toLocaleString()}.
                       </div>
                    )}

                    <div className="space-y-4 pt-6 border-t border-white/10">
                        <div className="flex justify-between items-center">
                           <h3 className="text-[10px] font-black uppercase tracking-[.2em] text-white/40">💰 Registro de Cobros</h3>
                           <button onClick={() => setIsCobroModalOpen(true)} className="p-2 hover:bg-white/10 rounded transition-all"><Plus className="w-4 h-4 text-sleek-accent" /></button>
                        </div>
                        <div className="space-y-2">
                           {form.cobros.map((cob: any, idx: number) => (
                             <div key={idx} className="flex justify-between items-center p-3 bg-white/5 rounded-lg group">
                                <div>
                                   <p className="text-[10px] font-black uppercase tracking-widest">{cob.metodo}</p>
                                   <p className="text-[8px] font-bold text-white/30 italic">{safeFormat(cob.fecha, 'dd/MM/yyyy')}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                   <span className="text-xs font-black">$ {cob.monto.toLocaleString()}</span>
                                   <button onClick={() => removeCobro(idx)} className="text-white/20 hover:text-rose-500 p-1"><X className="w-3 h-3" /></button>
                                </div>
                             </div>
                           ))}
                           {form.cobros.length === 0 && (
                             <p className="text-[10px] text-center py-4 text-white/20 font-bold uppercase italic border border-white/5 rounded-lg border-dashed">Sin pagos registrados</p>
                           )}
                        </div>
                     </div>

                     <div className="mt-8 grid grid-cols-2 gap-4">
                         <div className="p-4 bg-white/5 rounded-xl text-center">
                            <p className="text-[8px] font-black text-white/30 uppercase mb-1">Pagado</p>
                            <p className="text-sm font-black text-emerald-400">$ {displayNum(form.totalCobrado || 0, 2)}</p>
                         </div>
                         <div className="p-4 bg-white/5 rounded-xl text-center">
                            <p className="text-[8px] font-black text-white/30 uppercase mb-1">Restante</p>
                            <p className="text-sm font-black text-rose-400">$ {displayNum(form.saldoPendiente || 0, 2)}</p>
                         </div>
                     </div>

                     <div className="space-y-4 pt-6 border-t border-white/10">
                        <button 
                          disabled={isSubmitting}
                          onClick={() => {
                            if (!form.clienteId || form.productos.length === 0) {
                              showNotification('Datos incompletos para guardar borrador', 'error');
                              return;
                            }
                            executeSave(false);
                          }}
                          className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-black rounded-xl text-xs uppercase tracking-widest border border-white/20 transition-all disabled:opacity-50"
                        >
                          {isSubmitting ? 'Guardando...' : 'Guardar como Borrador'}
                        </button>
                        <button 
                          disabled={isSubmitting}
                          onClick={handleFinalizeClick}
                          className="w-full py-4 bg-sleek-accent hover:bg-amber-600 text-white font-black rounded-xl text-xs uppercase tracking-widest shadow-xl transition-all disabled:opacity-50"
                        >
                          {isSubmitting ? 'Procesando...' : 'Finalizar Venta'}
                        </button>
                     </div>
                  </Card>
               </div>
            </div>
        </div>

        {/* Global Confirmation Modal */}
        {isConfirmModalOpen && (
          <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-white rounded-3xl p-8 w-full max-w-md animate-in zoom-in-95 shadow-2xl text-center">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-6 mx-auto">
                   <AlertCircle className="w-8 h-8 text-amber-500" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-[0.2em] mb-4 text-sleek-dark">¿Finalizar Transacción?</h3>
                <p className="text-[10px] text-slate-500 font-bold text-center leading-relaxed mb-8 uppercase tracking-widest">
                  Se generará el comprobante <span className="text-sleek-dark">{form.comprobante}</span> por <span className="text-base font-black text-sleek-dark block mt-2">$ {displayNum(form.total, 2)}</span>. El stock de los productos se descontará inmediatamente.
                </p>
                <div className="flex gap-4">
                   <button onClick={() => setIsConfirmModalOpen(false)} className="flex-1 py-4 font-black uppercase text-[9px] tracking-widest text-slate-400">Volver</button>
                   <button onClick={() => executeSave(true)} className="flex-2 py-4 bg-sleek-dark text-white font-black rounded-2xl uppercase text-[9px] tracking-widest shadow-xl transition-all hover:bg-slate-800">
                      Confirmar y Finalizar
                   </button>
                </div>
             </div>
          </div>
        )}

        {isCobroModalOpen && (
          <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-white rounded-3xl p-8 w-full max-w-md animate-in zoom-in-95 shadow-2xl">
                <h3 className="text-sm font-black uppercase tracking-[0.2em] mb-8 text-sleek-dark">Registrar Ingreso</h3>
                <div className="space-y-6 mb-8">
                   <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monto ($)</label>
                      <div className="relative">
                        <input type="number" autoFocus value={newCobro.monto} onChange={(e) => setNewCobro({ ...newCobro, monto: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-black text-xl text-sleek-dark" />
                        <button onClick={() => setNewCobro({ ...newCobro, monto: form.saldoPendiente })} className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-sleek-accent px-2 py-1 bg-sleek-accent/10 rounded">Completar ({form.saldoPendiente})</button>
                      </div>
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Método</label>
                      <select value={newCobro.metodo} onChange={(e: any) => setNewCobro({ ...newCobro, metodo: e.target.value })} className="w-full px-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-slate-700">
                         <option value="Efectivo">Efectivo</option>
                         <option value="Transferencia">Transferencia</option>
                         <option value="Cheque">Cheque</option>
                         <option value="Otro">Otro</option>
                      </select>
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</label>
                      <input type="date" value={newCobro.fecha} onChange={(e) => setNewCobro({ ...newCobro, fecha: e.target.value })} className="w-full px-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-slate-700" />
                   </div>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => setIsCobroModalOpen(false)} className="flex-1 py-4 font-black uppercase text-[10px] tracking-widest text-slate-400">Cancelar</button>
                  <button onClick={handleAddCobro} className="flex-2 py-4 bg-sleek-dark text-white font-black rounded-2xl uppercase text-[10px] tracking-widest shadow-xl">Aceptar</button>
                </div>
             </div>
          </div>
        )}
        
        {isReturnModalOpen && returnItemIdx !== null && (
          <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
             <div className="bg-white rounded-[2.5rem] p-10 w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-8 mx-auto">
                   <Package className="w-10 h-10 text-amber-500" />
                </div>
                
                <h3 className="text-sm font-black uppercase tracking-[0.25em] mb-4 text-center text-sleek-dark">Devolver mercadería al almacén</h3>
                
                <div className="bg-slate-50 rounded-2xl p-6 mb-8 space-y-3">
                   <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-slate-400">
                      <span>Producto a devolver</span>
                      <span className="text-amber-600">Edición de Venta</span>
                   </div>
                   <p className="text-xs font-black text-sleek-dark uppercase">
                      {productos.find((p: any) => p.id === form.productos[returnItemIdx!]?.productoId)?.nombre}
                   </p>
                   <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pt-2 border-t border-slate-200">
                      {form.productos[returnItemIdx!]?.codigoBarras 
                        ? `Envase [${form.productos[returnItemIdx!]?.codigoBarras}] - ${form.productos[returnItemIdx!]?.cantidad} kg`
                        : `${form.productos[returnItemIdx!]?.cantidad} ${form.productos[returnItemIdx!]?.unidad} (Carga Manual)`
                      }
                   </p>
                </div>

                <div className="space-y-4 mb-10">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Almacén Destino</label>
                   <select 
                     value={returnAlmacenId}
                     onChange={(e) => setReturnAlmacenId(e.target.value)}
                     className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-amber-500/10 outline-none text-xs font-black uppercase text-sleek-dark transition-all"
                   >
                     <option value="">Seleccionar Almacén...</option>
                     {almacenes.map((a: any) => (
                       <option key={a.id} value={a.id}>{a.nombre}</option>
                     ))}
                   </select>
                </div>

                <div className="flex flex-col gap-3">
                   <button 
                     onClick={handleConfirmReturn}
                     disabled={!returnAlmacenId}
                     className="w-full py-5 bg-amber-500 hover:bg-amber-600 border-b-4 border-amber-800 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-none text-white font-black rounded-2xl uppercase text-[10px] tracking-[.3em] shadow-xl hover:shadow-2xl transition-all"
                   >
                     Confirmar Devolución
                   </button>
                   <button 
                     onClick={() => { setIsReturnModalOpen(false); setReturnItemIdx(null); }}
                     className="w-full py-4 text-slate-400 hover:text-sleek-dark font-black uppercase text-[9px] tracking-[.2em] transition-colors"
                   >
                     Cancelar
                   </button>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

const RemitoView = ({ venta, cliente, productos, onBack }: any) => {
   const sucursal = cliente?.sucursales.find((s: any) => s.id === venta.sucursalId);
   
   const imprimirRemito = () => {
    // 1. Obtener el HTML del remito
    const remitoContainer = document.querySelector('.remito-container');
    
    if (!remitoContainer) {
        globalAlert('No se encontró el contenido del remito');
        return;
    }
    
    const remitoHTML = remitoContainer.innerHTML;
    
    // 2. Abrir una ventana nueva
    const ventanaImpresion = window.open('', '_blank', 'width=1000,height=800');
    
    if (!ventanaImpresion) {
        globalAlert('Fallo al abrir ventana de impresión. Por favor verifique si los popups están bloqueados.');
        return;
    }

    // 3. Escribir el contenido del remito en la ventana nueva con estilos profesionales
    ventanaImpresion.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Remito - Alido Gestión - ${venta.comprobante}</title>
            <style>
                /* Reset básico y Tipografía */
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Helvetica Neue', Arial, sans-serif;
                    background: white;
                    color: #1A2B3C;
                    line-height: 1.4;
                }
                
                .remito-wrapper {
                    max-width: 210mm;
                    margin: 0 auto;
                    padding: 15mm;
                }

                /* Header */
                .border-b-4 { border-bottom: 4px solid #1A2B3C; }
                .pb-8 { padding-bottom: 2rem; }
                .flex { display: flex; }
                .justify-between { justify-content: space-between; }
                .items-start { align-items: flex-start; }
                .items-center { align-items: center; }
                .gap-10 { gap: 2.5rem; }
                
                .logo-box {
                    width: 96px;
                    height: 96px;
                    background: #1A2B3C;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                }

                .title-main {
                    font-size: 2rem;
                    font-weight: 900;
                    font-style: italic;
                    letter-spacing: -0.05em;
                    color: #1A2B3C;
                }

                .subtitle {
                    font-size: 10px;
                    font-weight: bold;
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    margin-top: 0.5rem;
                }

                .text-right { text-align: right; }
                .remito-box {
                    background: #1A2B3C;
                    color: white;
                    padding: 0.75rem 2rem;
                    margin-bottom: 1rem;
                    display: inline-block;
                }
                .remito-box h3 { font-size: 1.25rem; font-weight: 900; letter-spacing: 0.2em; }

                /* Info Grid */
                .grid { display: grid; }
                .grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
                .gap-12 { gap: 3rem; }
                .py-10 { padding-top: 2.5rem; padding-bottom: 2.5rem; }
                .border-b { border-bottom: 1px solid #f1f5f9; }

                .label-small {
                    font-size: 10px;
                    font-weight: 900;
                    color: #F27D26;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    border-bottom: 1px solid rgba(242, 125, 38, 0.2);
                    padding-bottom: 0.5rem;
                    margin-bottom: 1.5rem;
                }

                .razon-social { font-size: 1.125rem; font-weight: 900; text-transform: uppercase; }
                .text-secondary { font-size: 0.75rem; font-weight: bold; color: #64748b; margin-top: 0.25rem; }

                /* Table */
                table { width: 100%; border-collapse: collapse; margin-top: 2.5rem; }
                th {
                    text-align: left;
                    padding: 1rem 0;
                    font-size: 10px;
                    font-weight: 900;
                    text-transform: uppercase;
                    color: #94a3b8;
                    border-bottom: 2px solid #f1f5f9;
                }
                td {
                    padding: 1.5rem 0;
                    border-bottom: 1px solid #f8fafc;
                    vertical-align: middle;
                }
                .p-name { font-size: 0.75rem; font-weight: 900; text-transform: uppercase; }
                .p-code { font-size: 9px; font-weight: bold; color: #94a3b8; text-transform: uppercase; }
                .text-center { text-align: center; }
                .text-right-aligned { text-align: right; }

                /* Totals */
                .totals-container {
                    margin-top: 3rem;
                    padding-top: 2rem;
                    border-top: 4px solid #1A2B3C;
                }
                .total-row {
                    display: flex;
                    justify-content: flex-end;
                    gap: 4rem;
                }
                .total-final {
                    font-size: 1.75rem;
                    font-weight: 900;
                }

                /* Botón y Previsualización */
                .no-print {
                    text-align: center;
                    margin-bottom: 30px;
                    padding: 20px;
                    background: #f8fafc;
                    border-radius: 12px;
                    border: 1px solid #e2e8f0;
                }
                
                .btn-print {
                    display: inline-block;
                    padding: 14px 40px;
                    background: #1A2B3C;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 900;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    cursor: pointer;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                    transition: all 0.2s;
                }
                .btn-print:hover { background: #0f172a; transform: translateY(-1px); }
                
                @media print {
                    .no-print { display: none !important; }
                    body { padding: 0; }
                    @page { margin: 10mm; }
                    .remito-wrapper { width: 100%; margin: 0; padding: 0; }
                }

                /* Utility helper for font weights in the table */
                .font-black { font-weight: 900; }
            </style>
        </head>
        <body>
            <div class="no-print">
                <button class="btn-print" onclick="window.print()">🖨️ IMPRIMIR COMPROBANTE</button>
                <p style="margin-top: 10px; font-size: 11px; color: #64748b; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em;">
                    Haga clic en el botón superior o use Ctrl + P para imprimir
                </p>
            </div>
            <div class="remito-wrapper">
                ${remitoHTML}
            </div>
        </body>
        </html>
    `);
    
    // 4. Cerrar el documento para que se renderice
    ventanaImpresion.document.close();
    
    // 5. Intentar imprimir después de un breve delay para asegurar renderizado
    setTimeout(() => {
        ventanaImpresion.focus();
        // window.print() es síncrono y bloquea el hilo, pero en la ventana nueva es más seguro
    }, 500);
   };

   return (
     <div className="bg-slate-100 min-h-screen p-8 animate-in fade-in duration-500">
        <div className="max-w-4xl mx-auto space-y-8 no-print">
           <div className="flex items-center gap-4">
              <button onClick={onBack} className="p-2 hover:bg-white rounded-lg transition-all"><ArrowLeft className="w-5 h-5 text-slate-400" /></button>
              <h1 className="text-xl font-black uppercase tracking-widest text-sleek-dark">Vista del Remito / Comprobante</h1>
           </div>
           <Card className="p-4 bg-white flex justify-between items-center shadow-lg border-t-8 border-sleek-dark no-print">
              <p className="text-xs font-bold text-slate-500 italic">Previsualización del documento. El diseño se ajustará al papel al imprimir.</p>
              <button 
                id="btn-imprimir-remito"
                data-action="imprimir-remito"
                onClick={imprimirRemito}
                className="bg-sleek-dark hover:bg-slate-800 text-white px-8 py-3 rounded-lg font-black text-xs uppercase tracking-widest shadow-xl transition-all flex items-center gap-3 btn-imprimir-remito"
              >
                <Printer className="w-5 h-5" /> Imprimir Documento
              </button>
           </Card>
        </div>

        <div className="max-w-[210mm] mx-auto bg-white p-[15mm] mt-8 shadow-2xl print:shadow-none print:mt-0 print:p-[10mm] remito-container">
           <div className="flex justify-between items-start border-b-4 border-sleek-dark pb-8">
              <div className="flex items-center gap-10">
                 <div className="w-24 h-24 bg-sleek-dark flex items-center justify-center">
                   <Package className="w-12 h-12 text-white" />
                 </div>
                 <div>
                    <h2 className="text-3xl font-black italic tracking-tighter text-sleek-dark">ALIDO - Gestión</h2>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">Planta Elaboradora & Distribución</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-1">Av. Central 4520, CP 1430</p>
                 </div>
              </div>
              <div className="text-right">
                 <div className="bg-sleek-dark text-white px-8 py-3 mb-4 inline-block">
                    <h3 className="text-xl font-black uppercase tracking-[.2em]">REMITO</h3>
                 </div>
                 <p className="text-sm font-black text-sleek-dark">Nº {venta.comprobante}</p>
                 <p className="text-xs font-bold text-slate-500 italic mt-1">Fecha: {safeFormat(venta.fecha, 'dd/MM/yyyy')}</p>
              </div>
           </div>

           <div className="grid grid-cols-2 gap-12 py-10 border-b border-slate-100">
              <div className="space-y-6">
                 <h4 className="text-[10px] font-black text-sleek-accent uppercase tracking-widest border-b border-sleek-accent/20 pb-2">Destinatario</h4>
                 <div>
                    <p className="text-lg font-black text-sleek-dark uppercase">{cliente?.razonSocial}</p>
                    <p className="text-xs font-bold text-slate-500 mt-1">CUIT: {cliente?.cuit || 'S/D'}</p>
                 </div>
                 <div className="pt-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Destino / Sucursal</p>
                    <p className="text-sm font-black text-slate-600 uppercase">{sucursal?.nombre || 'S/D'}</p>
                    <p className="text-xs font-bold text-slate-500 mt-1">{sucursal?.direccion || 'S/P'}</p>
                 </div>
              </div>
              <div className="space-y-6 text-right">
                 <h4 className="text-[10px] font-black text-sleek-accent uppercase tracking-widest border-b border-sleek-accent/20 pb-2">Información Comercial</h4>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cond. Pago</p>
                       <p className="text-sm font-black text-slate-600 uppercase">{cliente?.condicionPago}</p>
                    </div>
                 </div>
              </div>
           </div>

           <div className="py-10">
              <table className="w-full">
                 <thead>
                    <tr className="border-b-2 border-slate-100">
                       <th className="text-left py-4 text-[10px] font-black uppercase text-slate-400">Producto / Descripción</th>
                       <th className="text-center py-4 text-[10px] font-black uppercase text-slate-400">Bulto / ID</th>
                       <th className="text-right py-4 text-[10px] font-black uppercase text-slate-400 font-black">Cant.</th>
                       <th className="text-right py-4 text-[10px] font-black uppercase text-slate-400">Peso</th>
                       <th className="text-right py-4 text-[10px] font-black uppercase text-slate-400">Precio Unit.</th>
                       <th className="text-right py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Subtotal</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {venta.productos.map((item: any, idx: number) => {
                       const p = productos.find((prod: any) => prod.id === item.productoId);
                       const isKg = p?.unidadMedidaId === 'u1';
                       return (
                         <tr key={idx}>
                            <td className="py-6 pr-8">
                               <p className="text-xs font-black text-sleek-dark uppercase">{p?.nombre}</p>
                               <p className="text-[9px] font-bold text-slate-400 uppercase">{p?.codigo}</p>
                            </td>
                            <td className="py-6 text-center text-xs font-black text-slate-500">
                               {item.codigoBarras || '-'}
                            </td>
                            <td className="py-6 text-right font-black text-xs text-sleek-dark">
                               {isKg ? `${formatNum(item.cantidad, 2)} kg` : `${item.cantidad} un`}
                            </td>
                            <td className="py-6 text-right font-bold text-[10px] text-slate-400">
                               {isKg ? '-' : `${formatNum(item.pesoKg || (item.cantidad * (p?.pesoNetoUnidad || 0)), 2)} kg`}
                            </td>
                            <td className="py-6 text-right font-bold text-xs text-slate-500">
                               $ {item.precioUnitario.toLocaleString()}
                            </td>
                            <td className="py-6 text-right font-black text-xs text-sleek-dark">
                               $ {item.subtotal.toLocaleString()}
                            </td>
                         </tr>
                       );
                    })}
                 </tbody>
              </table>

              <div className="mt-12 pt-8 border-t-4 border-sleek-dark flex justify-end">
                 <div className="w-80 space-y-4">
                    <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest text-slate-400">
                       <span>Subtotal</span>
                       <span>$ {venta.subtotal.toLocaleString()}</span>
                    </div>
                    {venta.descuentoGeneral > 0 && (
                      <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest text-slate-400">
                         <span>Descuentos Aplicados</span>
                         <span>- $ {venta.descuentoGeneral.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                       <span className="text-xs font-black uppercase tracking-widest text-sleek-dark">Monto Total</span>
                       <span className="text-2xl font-black text-sleek-dark leading-none">$ {venta.total.toLocaleString()}</span>
                    </div>
                 </div>
              </div>
           </div>

           <div className="mt-20 grid grid-cols-2 gap-20 pt-20 border-t border-slate-100">
              <div className="text-center pt-8 border-t border-slate-200">
                 <p className="text-[10px] font-black uppercase tracking-[.2em] text-slate-400">Firma Recibido</p>
                 <p className="text-[10px] font-bold text-slate-300 mt-2">Aclaración y DNI</p>
              </div>
              <div className="text-center pt-8 border-t border-slate-200">
                 <p className="text-[10px] font-black uppercase tracking-[.2em] text-slate-400">Despacho Alido</p>
                 <p className="text-[10px] font-bold text-slate-300 mt-2">Control de Calidad</p>
              </div>
           </div>
        </div>
     </div>
   );
};

const ClientesView = ({ clientes, setClientes, listasPrecios, productos, ventas, setVentas, cobrosClientes, setCobrosClientes, currentUser, showNotification }: any) => {
  const [view, setView] = useState<'list' | 'detail' | 'form'>('list');
  const [selectedCliente, setSelectedCliente] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCanal, setFilterCanal] = useState('Todos');
  const [filterPago, setFilterPago] = useState('Todos');
  const [filterEstado, setFilterEstado] = useState('Activo');

  // Account Statement Table Filters
  const [filterCtaDesde, setFilterCtaDesde] = useState('');
  const [filterCtaHasta, setFilterCtaHasta] = useState(new Date().toISOString().split('T')[0]);
  const [filterCtaTipo, setFilterCtaTipo] = useState('Todos');
  const [filterCtaSearch, setFilterCtaSearch] = useState('');

  // Registrar Cobro State
  const [isCobroModalOpen, setIsCobroModalOpen] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [cobroFormData, setCobroFormData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    monto: 0,
    metodo: 'Efectivo',
    referencia: '',
    observaciones: '',
    comprobante: `REC-${Date.now()}`
  });

  // Form State
  const [formCliente, setFormCliente] = useState<any>(null);

  const filteredClientes = clientes.filter((c: any) => {
    const matchesSearch = c.razonSocial.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (c.cuit && c.cuit.includes(searchTerm));
    const matchesCanal = filterCanal === 'Todos' || c.canal === filterCanal;
    const matchesPago = filterPago === 'Todos' || c.condicionPago === filterPago;
    const matchesEstado = filterEstado === 'Todos' || c.estado === filterEstado;
    return matchesSearch && matchesCanal && matchesPago && matchesEstado;
  });

  const getSaldoPendiente = (clienteId: string) => {
    const totalVentas = ventas
      .filter((v: any) => v.clienteId === clienteId && v.estado !== 'Anulado')
      .reduce((sum: number, v: any) => sum + (parseFloat(v.total) || 0), 0);
    
    const cobrosVentas = ventas
      .filter((v: any) => v.clienteId === clienteId && v.estado !== 'Anulado')
      .reduce((sum: number, v: any) => sum + (parseFloat(v.totalCobrado) || 0), 0);
      
    const cobrosInd = (cobrosClientes || [])
      .filter((c: any) => c.clienteId === clienteId && c.estado !== 'Anulado')
      .reduce((sum: number, c: any) => sum + (parseFloat(c.monto) || 0), 0);
      
    return totalVentas - cobrosVentas - cobrosInd;
  };

  const handleCreateNew = () => {
    setFormCliente({
      id: `c-${Date.now()}`,
      razonSocial: '',
      cuit: '',
      canal: 'Comercio',
      listaPrecioId: listasPrecios[0]?.id || '',
      condicionPago: 'Cuenta Corriente',
      topeCredito: 0,
      telefono: '',
      email: '',
      observaciones: '',
      estado: 'Activo',
      sucursales: [{ id: `s-${Date.now()}`, nombre: 'Casa Central', direccion: '' }],
      descuentosEspeciales: []
    });
    setView('form');
  };

  const renderModals = () => {
    if (!selectedCliente) return null;
    return (
      <>
        {/* Modals for Clientes Detail */}
        <Modal isOpen={isCobroModalOpen} onClose={() => setIsCobroModalOpen(false)} title="➕ Registrar Cobro Independiente">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fecha</label>
                <input 
                  type="date" 
                  value={cobroFormData.fecha}
                  onChange={(e) => setCobroFormData({ ...cobroFormData, fecha: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-emerald-500 outline-none text-sm font-bold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Comprobante</label>
                <input 
                  type="text" 
                  value={cobroFormData.comprobante}
                  onChange={(e) => setCobroFormData({ ...cobroFormData, comprobante: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded outline-none text-sm font-bold text-slate-400"
                  readOnly
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex justify-between">
                Monto a Cobrar ($)
                <button 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCobroFormData({ ...cobroFormData, monto: getSaldoPendiente(selectedCliente.id) }); }}
                  className="text-[9px] text-emerald-600 hover:underline"
                >
                  Cobrar Saldo Total
                </button>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                <input 
                  type="number" 
                  value={cobroFormData.monto}
                  onChange={(e) => setCobroFormData({ ...cobroFormData, monto: parseFloat(e.target.value) || 0 })}
                  className="w-full pl-8 pr-4 py-3 bg-emerald-50/50 border border-emerald-100 rounded text-xl font-black text-emerald-700 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Método</label>
                <select 
                  value={cobroFormData.metodo}
                  onChange={(e) => setCobroFormData({ ...cobroFormData, metodo: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded outline-none text-sm font-bold"
                >
                  <option value="Efectivo">Efectivo 💵</option>
                  <option value="Transferencia">Transferencia 🏦</option>
                  <option value="Cheque">Cheque 🎫</option>
                  <option value="Otro">Otro 💳</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Referencia / Nº Transf.</label>
                <input 
                  type="text" 
                  value={cobroFormData.referencia}
                  onChange={(e) => setCobroFormData({ ...cobroFormData, referencia: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded outline-none text-sm font-bold"
                  placeholder="Ej: 98234..."
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Observaciones</label>
              <textarea 
                value={cobroFormData.observaciones}
                onChange={(e) => setCobroFormData({ ...cobroFormData, observaciones: e.target.value })}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded outline-none text-sm font-bold h-20"
                placeholder="Notas opcionales..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
              <button onClick={() => setIsCobroModalOpen(false)} className="px-6 py-2 text-xs font-bold uppercase tracking-widest text-slate-400">Cancelar</button>
              <button 
                id="btn-confirmar-cobro" 
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); saveCobro(); }} 
                className="px-10 py-3 bg-emerald-500 text-white text-xs font-black uppercase tracking-[0.2em] rounded shadow-lg shadow-emerald-200"
              >
                Confirmar Cobro
              </button>
            </div>
          </div>
        </Modal>

        {/* Recibo / Venta View Modal */}
        <Modal isOpen={isReceiptModalOpen} onClose={() => setIsReceiptModalOpen(false)} title={selectedVoucher?.total ? "Detalle de Venta" : "Detalle de Cobro"}>
          {selectedVoucher && (
            <div className="space-y-8 p-4">
              <div className="flex justify-between items-start border-b pb-6">
                <div>
                  <h4 className="text-xl font-black italic tracking-tighter text-sleek-dark">
                    {selectedVoucher.total ? "REMITO DE VENTA" : "COMPROBANTE DE PAGO"}
                  </h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Nº {selectedVoucher.comprobante}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-slate-500 italic">Fecha: {safeFormat(selectedVoucher.fechaHora || selectedVoucher.fecha, 'dd/MM/yyyy HH:mm')}</p>
                  <Badge variant={selectedVoucher.estado === 'Anulado' ? 'danger' : 'success'} className="mt-2 text-[9px]">
                    {selectedVoucher.estado || 'VALIDADO'}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Cliente</p>
                  <p className="text-sm font-black text-sleek-dark uppercase">{selectedCliente.razonSocial}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Concepto</p>
                  <p className="text-sm font-black text-slate-600 uppercase">
                    {selectedVoucher.total ? "Venta de Mercaderías" : "Abono a Cuenta Corriente"}
                  </p>
                </div>
              </div>

              {selectedVoucher.total ? (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="py-2 text-[9px] font-bold text-slate-400 uppercase">Producto</th>
                          <th className="py-2 text-[9px] font-bold text-slate-400 uppercase text-right">Cant.</th>
                          <th className="py-2 text-[9px] font-bold text-slate-400 uppercase text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {(selectedVoucher.productos || []).map((p: any, i: number) => {
                          const prod = productos.find((item: any) => item.id === p.productoId);
                          return (
                            <tr key={i}>
                              <td className="py-3 text-[11px] font-bold text-slate-600">{prod?.nombre}</td>
                              <td className="py-3 text-[11px] font-bold text-slate-400 text-right">{p.cantidad} {p.unidad}</td>
                              <td className="py-3 text-[11px] font-black text-sleek-dark text-right">$ {(p.cantidad * (parseFloat(p.precioUnitario) || 0)).toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="pt-4 border-t border-sleek-dark flex justify-between items-center text-sleek-dark">
                    <span className="text-[10px] font-black uppercase tracking-widest">Total Comprobante</span>
                    <span className="text-xl font-black italic">$ {(parseFloat(selectedVoucher.total) || 0).toLocaleString()}</span>
                  </div>
                </div>
              ) : (
                <Card className="p-8 bg-slate-50 border-none flex flex-col items-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[.3em] mb-4">Monto Recibido</p>
                  <h3 className="text-4xl font-black text-sleek-dark">$ {(parseFloat(selectedVoucher.monto || selectedVoucher.haber || 0) || 0).toLocaleString()}</h3>
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mt-4">Metodo: {selectedVoucher.metodo}</p>
                </Card>
              )}

              <div className="space-y-4">
                 {selectedVoucher.referencia && (
                   <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Referencia</p>
                      <p className="text-xs font-bold text-slate-600">{selectedVoucher.referencia}</p>
                   </div>
                 )}
                 {selectedVoucher.observaciones && (
                   <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Observaciones</p>
                      <p className="text-xs font-bold text-slate-400 italic">"{selectedVoucher.observaciones}"</p>
                   </div>
                 )}
              </div>

              <div className="flex justify-end pt-8 border-t gap-3">
                <button 
                  onClick={() => {
                    const printWindow = window.open('', '_blank');
                    if (printWindow) {
                      const isVenta = !!selectedVoucher.total;
                      printWindow.document.write(`
                        <html>
                          <head>
                            <title>${isVenta ? 'Remito' : 'Recibo'} - ${selectedVoucher.comprobante}</title>
                            <style>
                              body { font-family: sans-serif; padding: 40px; color: #1a2b3c; }
                              .header { border-bottom: 2px solid #1a2b3c; padding-bottom: 20px; display: flex; justify-content: space-between; }
                              .content { margin-top: 40px; }
                              .amount-box { background: #f8fafc; padding: 30px; text-align: center; border: 1px solid #e2e8f0; border-radius: 10px; margin: 40px 0; }
                              .footer { margin-top: 100px; border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; color: #94a3b8; font-size: 10px; }
                              table { width: 100%; border-collapse: collapse; }
                              th { text-align: left; padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 10px; text-transform: uppercase; }
                              td { padding: 10px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
                            </style>
                          </head>
                          <body>
                            <div class="header">
                              <div>
                                <h1 style="margin:0; font-style: italic;">ALIDO - Gestión</h1>
                                <p style="margin:5px 0 0 0; font-size: 10px; font-bold; color: #64748b; letter-spacing: 2px;">${isVenta ? 'REMITO DE VENTA' : 'COMPROBANTE DE COBRO'}</p>
                              </div>
                              <div style="text-align: right">
                                <p style="margin:0; font-weight: bold;">Nº ${selectedVoucher.comprobante}</p>
                                <p style="margin:5px 0 0 0; font-size: 12px; color: #64748b;">Fecha: ${new Date(selectedVoucher.fechaHora || selectedVoucher.fecha).toLocaleDateString()}</p>
                              </div>
                            </div>
                            <div class="content">
                              <p style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Cliente</p>
                              <h2 style="margin: 10px 0;">${selectedCliente.razonSocial}</h2>
                              
                              ${isVenta ? `
                                <table>
                                  <thead>
                                    <tr><th>Producto</th><th>Cant.</th><th style="text-align: right">Precio</th><th style="text-align: right">Total</th></tr>
                                  </thead>
                                  <tbody>
                                    ${(selectedVoucher.productos || []).map((p: any) => `
                                      <tr>
                                        <td>${productos.find((item: any) => item.id === p.productoId)?.nombre || 'S/N'}</td>
                                        <td>${p.cantidad}</td>
                                        <td style="text-align: right">$ ${(parseFloat(p.precioUnitario) || 0).toLocaleString()}</td>
                                        <td style="text-align: right">$ ${(p.cantidad * (parseFloat(p.precioUnitario) || 0)).toLocaleString()}</td>
                                      </tr>
                                    `).join('')}
                                  </tbody>
                                </table>
                                <div style="text-align: right; margin-top: 30px; font-weight: 900; font-size: 24px;">
                                  TOTAL: $ ${(parseFloat(selectedVoucher.total) || 0).toLocaleString()}
                                </div>
                              ` : `
                                <div class="amount-box">
                                  <p style="font-size: 10px; font-weight: bold; color: #64748b; margin-bottom: 10px; letter-spacing: 2px;">MONTO RECIBIDO</p>
                                  <h2 style="font-size: 40px; margin: 0;">$ ${(parseFloat(selectedVoucher.monto || selectedVoucher.haber || 0) || 0).toLocaleString()}</h2>
                                  <p style="margin-top: 15px; font-size: 12px; font-weight: bold;">METODO: ${selectedVoucher.metodo}</p>
                                </div>
                              `}
                              
                              <p style="margin-top: 20px; font-size: 12px;"><strong>Referencia:</strong> ${selectedVoucher.referencia || '-'}</p>
                              <p style="font-size: 12px;"><strong>Concepto:</strong> ${isVenta ? 'Entrega de mercadería con facturación diferida' : 'Pago a cuenta corriente'}</p>
                            </div>
                            <div class="footer">
                              Documento generado por Alido - Gestión Comercial. Firma autorizada no requerida para recibos digitales validados.
                            </div>
                          </body>
                        </html>
                      `);
                      printWindow.document.close();
                      printWindow.print();
                    }
                  }}
                  className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" /> Imprimir
                </button>
                <button onClick={() => setIsReceiptModalOpen(false)} className="px-6 py-2 bg-sleek-dark text-white font-black text-[10px] uppercase tracking-widest rounded">Cerrar</button>
              </div>
            </div>
          )}
        </Modal>
      </>
    );
  };

  const handleRegistrarCobro = () => {
    if (!selectedCliente) return;
    const pending = getSaldoPendiente(selectedCliente.id);
    setCobroFormData({
      ...cobroFormData,
      monto: pending > 0 ? pending : 0,
      comprobante: `REC-${Date.now()}`
    });
    setIsCobroModalOpen(true);
  };

  const saveCobro = () => {
    if (!selectedCliente) return;
    if (cobroFormData.monto <= 0) {
      showNotification('El monto debe ser mayor a 0', 'error');
      return;
    }
    const nuevoCobro = {
      ...cobroFormData,
      id: `cbr-${Date.now()}`,
      clienteId: selectedCliente.id,
      estado: 'Activo',
      usuarioId: currentUser.id,
      fechaCreacion: new Date().toISOString()
    };
    setCobrosClientes([...(cobrosClientes || []), nuevoCobro]);
    showNotification('Cobro registrado con éxito', 'success');
    setIsCobroModalOpen(false);
  };

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('#btn-registrar-cobro');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        handleRegistrarCobro();
      }
    };
    document.addEventListener('click', handleGlobalClick, true);
    return () => document.removeEventListener('click', handleGlobalClick, true);
  }, [selectedCliente, handleRegistrarCobro]);

  const handleEdit = (cliente: any) => {
    setFormCliente({ ...cliente });
    setView('form');
  };

  const handleSave = () => {
    if (!formCliente.razonSocial) {
      showNotification('La Razón Social es obligatoria', 'error');
      return;
    }
    if (formCliente.sucursales.some((s: any) => !s.nombre || !s.direccion)) {
      showNotification('Todas las sucursales deben tener nombre y dirección', 'error');
      return;
    }

    if (clientes.find((c: any) => c.id === formCliente.id)) {
      setClientes(clientes.map((c: any) => c.id === formCliente.id ? formCliente : c));
      showNotification('Cliente actualizado con éxito', 'success');
    } else {
      setClientes([...clientes, formCliente]);
      showNotification('Cliente creado con éxito', 'success');
    }
    setView('list');
  };

  const addSucursal = () => {
    setFormCliente({
      ...formCliente,
      sucursales: [...formCliente.sucursales, { id: `s-${Date.now()}`, nombre: '', direccion: '' }]
    });
  };

  const updateSucursal = (id: string, field: string, value: string) => {
    setFormCliente({
      ...formCliente,
      sucursales: formCliente.sucursales.map((s: any) => s.id === id ? { ...s, [field]: value } : s)
    });
  };

  const removeSucursal = (id: string) => {
    if (formCliente.sucursales.length <= 1) {
      showNotification('El cliente debe tener al menos una sucursal', 'error');
      return;
    }
    setFormCliente({
      ...formCliente,
      sucursales: formCliente.sucursales.filter((s: any) => s.id !== id)
    });
  };

  const addDescuento = () => {
    if (productos.length === 0) return;
    setFormCliente({
      ...formCliente,
      descuentosEspeciales: [...formCliente.descuentosEspeciales, { productoId: productos[0].id, porcentaje: 0 }]
    });
  };

  const updateDescuento = (index: number, field: string, value: any) => {
    const fresh = [...formCliente.descuentosEspeciales];
    fresh[index] = { ...fresh[index], [field]: value };
    setFormCliente({ ...formCliente, descuentosEspeciales: fresh });
  };

  const removeDescuento = (index: number) => {
    setFormCliente({
      ...formCliente,
      descuentosEspeciales: formCliente.descuentosEspeciales.filter((_: any, i: number) => i !== index)
    });
  };

  if (view === 'form') {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex items-center gap-4">
          <button 
            id="btn-volver-listado-detail"
            onClick={(e) => { e.stopPropagation(); setView('list'); }} 
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-sleek-dark transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-sleek-dark uppercase tracking-widest">
            {clientes.find((c: any) => c.id === formCliente.id) ? 'Editar Cliente' : 'Nuevo Cliente'}
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card className="p-8">
              <h3 className="text-sm font-bold text-sleek-dark mb-6 uppercase tracking-widest flex items-center gap-2">
                <Users className="w-4 h-4 text-sleek-accent" /> Datos del Cliente
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Razón Social *</label>
                  <input 
                    type="text" 
                    value={formCliente.razonSocial}
                    onChange={(e) => setFormCliente({ ...formCliente, razonSocial: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700 transition-all"
                    placeholder="Nombre o Empresa"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">CUIT / DNI</label>
                  <input 
                    type="text" 
                    value={formCliente.cuit}
                    onChange={(e) => setFormCliente({ ...formCliente, cuit: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700 transition-all"
                    placeholder="XX-XXXXXXXX-X"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Canal de Venta *</label>
                  <select 
                    value={formCliente.canal}
                    onChange={(e) => setFormCliente({ ...formCliente, canal: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700 transition-all"
                  >
                    <option value="Distribuidor">Distribuidor</option>
                    <option value="Comercio">Comercio</option>
                    <option value="Particular">Particular</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lista de Precios *</label>
                  {listasPrecios.length > 0 ? (
                    <select 
                      value={formCliente.listaPrecioId}
                      onChange={(e) => setFormCliente({ ...formCliente, listaPrecioId: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700 transition-all"
                    >
                      {listasPrecios.filter((lp: any) => lp.estado === 'Activa').map((lp: any) => (
                        <option key={lp.id} value={lp.id}>{lp.nombre}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-3 bg-amber-50 rounded text-[10px] text-amber-700 font-bold uppercase">
                      No hay listas de precios activas. Créalas primero.
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Condición de Pago</label>
                  <select 
                    value={formCliente.condicionPago}
                    onChange={(e) => setFormCliente({ ...formCliente, condicionPago: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700 transition-all"
                  >
                    <option value="Cuenta Corriente">Cuenta Corriente</option>
                    <option value="Contado">Contado</option>
                  </select>
                </div>
                {formCliente.condicionPago === 'Cuenta Corriente' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tope de Crédito ($)</label>
                    <input 
                      type="number" 
                      value={formCliente.topeCredito}
                      onChange={(e) => setFormCliente({ ...formCliente, topeCredito: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700 transition-all"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Teléfono</label>
                  <input 
                    type="text" 
                    value={formCliente.telefono}
                    onChange={(e) => setFormCliente({ ...formCliente, telefono: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email</label>
                  <input 
                    type="email" 
                    value={formCliente.email}
                    onChange={(e) => setFormCliente({ ...formCliente, email: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700 transition-all"
                  />
                </div>
              </div>
              <div className="mt-6 space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Observaciones</label>
                <textarea 
                  value={formCliente.observaciones}
                  onChange={(e) => setFormCliente({ ...formCliente, observaciones: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700 transition-all"
                  rows={3}
                />
              </div>
            </Card>

            <Card className="p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-sm font-bold text-sleek-dark uppercase tracking-widest flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-sleek-accent" /> Sucursales
                </h2>
                <button 
                  onClick={addSucursal}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                >
                  <Plus className="w-3 h-3" /> Agregar Sucursal
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Nombre *</th>
                      <th className="text-left py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Dirección *</th>
                      <th className="text-left py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Tel/Resp/Horario</th>
                      <th className="text-right py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {formCliente.sucursales.map((s: any) => (
                      <tr key={s.id}>
                        <td className="py-4 pr-4">
                          <input 
                            type="text" 
                            value={s.nombre}
                            onChange={(e) => updateSucursal(s.id, 'nombre', e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded focus:ring-1 focus:ring-sleek-accent outline-none font-bold text-[11px]"
                            placeholder="Casa Central, Sucursal X..."
                          />
                        </td>
                        <td className="py-4 pr-4">
                          <input 
                            type="text" 
                            value={s.direccion}
                            onChange={(e) => updateSucursal(s.id, 'direccion', e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded focus:ring-1 focus:ring-sleek-accent outline-none font-bold text-[11px]"
                            placeholder="Av. 123..."
                          />
                        </td>
                        <td className="py-4 pr-4">
                          <div className="space-y-1">
                            <input 
                              type="text" 
                              value={s.telefono}
                              onChange={(e) => updateSucursal(s.id, 'telefono', e.target.value)}
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-100 rounded outline-none text-[10px]"
                              placeholder="Tel..."
                            />
                            <input 
                              type="text" 
                              value={s.responsable}
                              onChange={(e) => updateSucursal(s.id, 'responsable', e.target.value)}
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-100 rounded outline-none text-[10px]"
                              placeholder="Resp..."
                            />
                          </div>
                        </td>
                        <td className="py-4 text-right">
                          <button onClick={() => removeSucursal(s.id)} className="p-2 text-slate-300 hover:text-sleek-danger">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="space-y-8">
            <Card className="p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-sm font-bold text-sleek-dark uppercase tracking-widest flex items-center gap-2">
                  <Tag className="w-4 h-4 text-sleek-accent" /> Descuentos
                </h2>
                <button 
                  onClick={addDescuento}
                  className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              
              <div className="space-y-4">
                {formCliente.descuentosEspeciales.map((d: any, idx: number) => (
                  <div key={idx} className="p-4 bg-slate-50 rounded-lg space-y-3 relative group">
                    <button 
                      onClick={() => removeDescuento(idx)}
                      className="absolute top-2 right-2 p-1 text-slate-300 hover:text-sleek-danger opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Producto</label>
                      <select 
                        value={d.productoId}
                        onChange={(e) => updateDescuento(idx, 'productoId', e.target.value)}
                        className="w-full px-2 py-2 bg-white border border-slate-200 rounded text-[11px] font-bold"
                      >
                        {productos.map((p: any) => (
                          <option key={p.id} value={p.id}>{p.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Desto. %</label>
                      <div className="relative">
                        <input 
                          type="number" 
                          value={d.porcentaje}
                          onChange={(e) => updateDescuento(idx, 'porcentaje', parseFloat(e.target.value) || 0)}
                          className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded text-[11px] font-bold"
                        />
                        <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300" />
                      </div>
                    </div>
                  </div>
                ))}
                {formCliente.descuentosEspeciales.length === 0 && (
                  <p className="text-[10px] text-center py-4 text-slate-400 font-bold uppercase italic">Sin descuentos especiales</p>
                )}
              </div>
            </Card>

            <button 
              onClick={handleSave}
              className="w-full py-4 bg-sleek-dark hover:bg-slate-800 text-white font-black rounded-xl shadow-xl hover:shadow-2xl transition-all flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-xs"
            >
              <Save className="w-5 h-5" /> Guardar Cliente
            </button>
          </div>
        </div>
        {renderModals()}
      </div>
    );
  }

  if (view === 'detail' && selectedCliente) {
    const saldo = getSaldoPendiente(selectedCliente.id);
    const facturado = ventas
      .filter((v: any) => v.clienteId === selectedCliente.id && v.estado === 'Finalizado')
      .reduce((s: number, v: any) => s + (parseFloat(v.total) || 0), 0);
      
    const cobradoEnVentas = ventas
      .filter((v: any) => v.clienteId === selectedCliente.id && v.estado === 'Finalizado')
      .reduce((s: number, v: any) => s + (parseFloat(v.totalCobrado) || 0), 0);
      
    const cobradoIndependiente = (cobrosClientes || [])
      .filter((c: any) => c.clienteId === selectedCliente.id && c.estado !== 'Anulado')
      .reduce((s: number, c: any) => s + (parseFloat(c.monto) || 0), 0);
      
    const totalCobrado = cobradoEnVentas + cobradoIndependiente;
    const listaPrecio = listasPrecios.find((lp: any) => lp.id === selectedCliente.listaPrecioId);

    // Cuenta Corriente Logic
    const rawTransacciones = [
      ...ventas
        .filter((v: any) => v.clienteId === selectedCliente.id && v.estado !== 'Anulado')
        .map((v: any) => ({
          id: v.id,
          fecha: v.fechaHora || v.fecha,
          tipo: 'Cargo',
          detalle: 'Venta de Productos',
          comprobante: v.comprobante,
          sucursalId: v.sucursalId,
          debe: parseFloat(v.total) || 0,
          haber: 0,
          raw: v
        })),
      ...ventas
        .filter((v: any) => v.clienteId === selectedCliente.id && v.estado !== 'Anulado')
        .flatMap((v: any) => (v.cobros || []).map((c: any, idx: number) => ({
          id: `${v.id}-cobro-${idx}`,
          fecha: c.fecha,
          tipo: 'Cobro (Venta)',
          detalle: `Cobro en venta ${v.comprobante} - ${c.metodo}`,
          comprobante: v.comprobante,
          sucursalId: v.sucursalId,
          debe: 0,
          haber: parseFloat(c.monto) || 0,
          raw: v
        }))),
      ...(cobrosClientes || [])
        .filter((c: any) => c.clienteId === selectedCliente.id && c.estado !== 'Anulado')
        .map((c: any) => ({
          id: c.id,
          fecha: c.fecha,
          tipo: 'Pago Recibido',
          detalle: `Cobro independiente - ${c.metodo} ${c.referencia ? `(${c.referencia})` : ''}`,
          comprobante: c.comprobante,
          sucursalId: null,
          debe: 0,
          haber: parseFloat(c.monto) || 0,
          raw: c
        }))
    ].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

    const filteredTransacciones = rawTransacciones.filter(t => {
      const tDate = t.fecha.split('T')[0];
      const matchesDesde = !filterCtaDesde || tDate >= filterCtaDesde;
      const matchesHasta = !filterCtaHasta || tDate <= filterCtaHasta;
      const matchesTipo = filterCtaTipo === 'Todos' || 
                         (filterCtaTipo === 'Solo Cargos (Ventas)' && t.tipo === 'Cargo') ||
                         (filterCtaTipo === 'Solo Pagos (Cobros)' && (t.tipo === 'Cobro (Venta)' || t.tipo === 'Pago Recibido'));
      const matchesSearch = !filterCtaSearch || t.comprobante.toLowerCase().includes(filterCtaSearch.toLowerCase());
      return matchesDesde && matchesHasta && matchesTipo && matchesSearch;
    });

    let runningSaldo = 0;
    const transaccionesConSaldo = filteredTransacciones.map(t => {
      runningSaldo += t.debe - t.haber;
      return { ...t, saldoAcumulado: runningSaldo };
    }).reverse();

    return (
      <div className="space-y-8 animate-in slide-in-from-right duration-500">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setView('list')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-sleek-dark transition-all">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-sleek-dark uppercase tracking-widest">{selectedCliente.razonSocial}</h1>
                <Badge variant={selectedCliente.canal === 'Distribuidor' ? 'info' : selectedCliente.canal === 'Comercio' ? 'success' : 'warning'}>
                  {selectedCliente.canal}
                </Badge>
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                {selectedCliente.condicionPago} | Lista: {listaPrecio?.nombre || '-'}
              </p>
            </div>
          </div>
          <button 
            onClick={() => handleEdit(selectedCliente)}
            className="px-6 py-2 bg-slate-100 hover:bg-sleek-dark hover:text-white text-sleek-dark font-black rounded-lg text-[10px] uppercase tracking-widest transition-all ring-1 ring-slate-200"
          >
            Editar Cliente
          </button>
        </div>

        {selectedCliente.condicionPago === 'Cuenta Corriente' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="p-6 border-l-4 border-l-sleek-dark">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Total Facturado</p>
              <p className="text-lg font-black text-sleek-dark">$ {facturado.toLocaleString()}</p>
            </Card>
            <Card className="p-6 border-l-4 border-l-sleek-success">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Total Cobrado</p>
              <p className="text-lg font-black text-sleek-success">$ {totalCobrado.toLocaleString()}</p>
            </Card>
            <Card className={cn(
              "p-6 border-l-4",
              saldo <= 0 ? "border-l-sleek-success" : 
              selectedCliente.topeCredito && saldo > selectedCliente.topeCredito ? "border-l-sleek-danger" : 
              selectedCliente.topeCredito && saldo > selectedCliente.topeCredito * 0.8 ? "border-l-sleek-warning" : "border-l-sleek-dark"
            )}>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">
                {saldo < 0 ? "Saldo a Favor" : "Saldo Pendiente"}
              </p>
              <p className={cn(
                "text-lg font-black",
                saldo <= 0 ? "text-sleek-success" : 
                selectedCliente.topeCredito && saldo > selectedCliente.topeCredito ? "text-sleek-danger" : "text-sleek-dark"
              )}>$ {Math.abs(saldo).toLocaleString()}</p>
            </Card>
            <Card className="p-6">
              <div className="mb-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Tope de Crédito</p>
                <div className="flex justify-between items-baseline">
                  <p className="text-lg font-black text-slate-700">$ {(selectedCliente.topeCredito || 0).toLocaleString()}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">
                    {selectedCliente.topeCredito > 0 ? `${Math.round((Math.max(0, saldo) / selectedCliente.topeCredito) * 100)}%` : '0%'}
                  </p>
                </div>
              </div>
              {selectedCliente.topeCredito > 0 && (
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className={cn(
                      "h-full transition-all duration-500",
                      (saldo / selectedCliente.topeCredito) > 1 ? "bg-sleek-danger" : 
                      (saldo / selectedCliente.topeCredito) > 0.8 ? "bg-sleek-warning" : "bg-sleek-accent"
                    )}
                    style={{ width: `${Math.min(100, Math.max(0, (saldo / selectedCliente.topeCredito) * 100))}%` }}
                  />
                </div>
              )}
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card>
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-[11px] font-black uppercase text-sleek-dark tracking-[0.2em] flex items-center gap-3">
                  <DollarSign className="w-4 h-4 text-sleek-accent" /> Cuenta Corriente
                </h3>
                <button 
                  id="btn-registrar-cobro"
                  data-action="registrar-cobro"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleRegistrarCobro();
                  }}
                  className="btn-registrar-cobro bg-sleek-success hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest shadow-lg transition-all flex items-center gap-2"
                >
                  <Plus className="w-3.5 h-3.5" /> Registrar Cobro
                </button>
              </div>

              {/* BARRA DE FILTROS CUENTA CORRIENTE */}
              <div className="px-8 py-4 bg-slate-50/50 border-b border-slate-100 grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Desde</label>
                  <input 
                    type="date" 
                    value={filterCtaDesde}
                    onChange={(e) => setFilterCtaDesde(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-[11px] font-bold outline-none focus:ring-1 focus:ring-sleek-accent"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Hasta</label>
                  <input 
                    type="date" 
                    value={filterCtaHasta}
                    onChange={(e) => setFilterCtaHasta(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-[11px] font-bold outline-none focus:ring-1 focus:ring-sleek-accent"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Tipo</label>
                  <select 
                    value={filterCtaTipo}
                    onChange={(e) => setFilterCtaTipo(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-[11px] font-bold outline-none focus:ring-1 focus:ring-sleek-accent appearance-none"
                  >
                    <option value="Todos">Todos</option>
                    <option value="Solo Cargos (Ventas)">Solo Cargos (Ventas)</option>
                    <option value="Solo Pagos (Cobros)">Solo Pagos (Cobros)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Buscador</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300" />
                    <input 
                      type="text" 
                      placeholder="Nº Comprobante..."
                      value={filterCtaSearch}
                      onChange={(e) => setFilterCtaSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded text-[11px] font-bold outline-none focus:ring-1 focus:ring-sleek-accent"
                    />
                  </div>
                </div>
                <div className="flex items-center">
                  <button 
                    onClick={() => {
                      setFilterCtaDesde('');
                      setFilterCtaHasta(new Date().toISOString().split('T')[0]);
                      setFilterCtaTipo('Todos');
                      setFilterCtaSearch('');
                    }}
                    className="text-[10px] font-black text-slate-400 hover:text-sleek-danger uppercase tracking-widest transition-colors flex items-center gap-1.5 py-2.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Limpiar Filtros
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="px-8 py-4 text-left text-[10px] font-black uppercase text-slate-400 tracking-widest">Fecha</th>
                      <th className="px-8 py-4 text-left text-[10px] font-black uppercase text-slate-400 tracking-widest">Tipo</th>
                      <th className="px-8 py-4 text-left text-[10px] font-black uppercase text-slate-400 tracking-widest">Comprobante</th>
                      <th className="px-8 py-4 text-right text-[10px] font-black uppercase text-slate-400 tracking-widest">Debe (+)</th>
                      <th className="px-8 py-4 text-right text-[10px] font-black uppercase text-slate-400 tracking-widest">Haber (-)</th>
                      <th className="px-8 py-4 text-right text-[10px] font-black uppercase text-slate-400 tracking-widest">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {transaccionesConSaldo.length > 0 ? (
                      transaccionesConSaldo.map((t: any) => (
                        <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-8 py-4 font-bold text-slate-600 whitespace-nowrap">{safeFormat(t.fecha, 'dd/MM/yy HH:mm')}</td>
                          <td className="px-8 py-4">
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest",
                              t.tipo === 'Cargo' ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-700"
                            )}>{t.tipo}</span>
                          </td>
                          <td className="px-8 py-4">
                            <button 
                              onClick={() => {
                                setSelectedVoucher(t.raw);
                                setIsReceiptModalOpen(true);
                              }}
                              className="font-black text-sleek-dark hover:text-sleek-accent underline decoration-sleek-accent/20 transition-all underline-offset-2"
                            >
                              {t.comprobante}
                            </button>
                          </td>
                          <td className="px-8 py-4 text-right font-black text-slate-400">{t.debe > 0 ? `$ ${t.debe.toLocaleString()}` : '-'}</td>
                          <td className="px-8 py-4 text-right font-black text-sleek-success">{t.haber > 0 ? `$ ${t.haber.toLocaleString()}` : '-'}</td>
                          <td className="px-8 py-4 text-right font-black text-sleek-dark bg-slate-50/30">$ {t.saldoAcumulado.toLocaleString()}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-8 py-12 text-center text-[10px] font-bold text-slate-400 uppercase italic whitespace-nowrap">No se registran transacciones para este cliente</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {(filterCtaDesde || filterCtaHasta !== new Date().toISOString().split('T')[0] || filterCtaTipo !== 'Todos' || filterCtaSearch) && (
                <div className="px-8 py-3 bg-slate-50/50 border-t border-slate-50 flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Mostrando <span className="text-sleek-dark font-black">{filteredTransacciones.length}</span> de <span className="text-sleek-dark font-black">{rawTransacciones.length}</span> transacciones
                  </p>
                  <div className="flex gap-4 items-center">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Cargos</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Pagos</span>
                    </div>
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <div className="px-8 py-6 border-b border-slate-100">
                 <h3 className="text-[11px] font-black uppercase text-sleek-dark tracking-[0.2em] flex items-center gap-3">
                  <MapPin className="w-4 h-4 text-sleek-accent" /> Ubicaciones y Sucursales
                </h3>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedCliente.sucursales.map((s: any) => (
                  <div key={s.id} className="p-6 bg-slate-50 rounded-xl border border-slate-100 hover:shadow-lg transition-all group">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-10 h-10 rounded shadow-inner bg-white flex items-center justify-center">
                        <MapPin className="w-5 h-5 text-sleek-accent" />
                      </div>
                      <Badge variant="info">Activa</Badge>
                    </div>
                    <h4 className="text-sm font-black text-sleek-dark uppercase mb-4">{s.nombre}</h4>
                    <div className="space-y-4">
                      <div className="flex items-start gap-4">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                          <MapPin className="w-4 h-4 text-slate-400" />
                        </div>
                        <div>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Dirección</p>
                          <p className="text-[11px] font-black text-slate-600 uppercase">{s.direccion}</p>
                        </div>
                      </div>
                      {s.telefono && (
                        <div className="flex items-center gap-4">
                          <Phone className="w-4 h-4 text-slate-300" />
                          <p className="text-[11px] font-bold text-slate-600">{s.telefono}</p>
                        </div>
                      )}
                      {s.responsable && (
                        <div className="flex items-center gap-4">
                          <Users className="w-4 h-4 text-slate-300" />
                          <p className="text-[11px] font-bold text-slate-600">Resp: {s.responsable}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-8">
            <Card className="p-8">
              <h3 className="text-[11px] font-black uppercase text-sleek-dark tracking-[0.2em] mb-6 flex items-center gap-3">
                <Tag className="w-4 h-4 text-sleek-accent" /> Descuentos Especiales
              </h3>
              <div className="space-y-4">
                {selectedCliente.descuentosEspeciales.map((d: any, idx: number) => {
                  const p = productos.find((prod: any) => prod.id === d.productoId);
                  return (
                    <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-white flex items-center justify-center text-[10px] font-bold border border-slate-100">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-[11px] font-black text-sleek-dark uppercase">{p?.nombre}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{p?.codigo}</p>
                        </div>
                      </div>
                      <Badge variant="success" className="text-xs">-{d.porcentaje}%</Badge>
                    </div>
                  );
                })}
                {selectedCliente.descuentosEspeciales.length === 0 && (
                  <div className="text-center py-6 text-slate-300">
                    <Tag className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-[10px] font-bold uppercase italic">Sin descuentos configurados</p>
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-8">
              <h3 className="text-[11px] font-black uppercase text-sleek-dark tracking-[0.2em] mb-6">Información Adicional</h3>
              <div className="space-y-6">
                 <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">CUIT / DNI</p>
                    <p className="text-[11px] font-black text-slate-700">{selectedCliente.cuit || '-'}</p>
                 </div>
                 <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Contacto Directo</p>
                    <p className="text-[11px] font-black text-slate-700">{selectedCliente.telefono || '-'}</p>
                    <p className="text-[11px] font-bold text-slate-400 lowercase italic">{selectedCliente.email || '-'}</p>
                 </div>
                 {selectedCliente.observaciones && (
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Notas Internas</p>
                      <p className="text-[11px] font-bold text-slate-500 italic">"{selectedCliente.observaciones}"</p>
                    </div>
                 )}
              </div>
            </Card>
          </div>
        </div>
        {renderModals()}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-sleek-dark uppercase tracking-widest">Base de Clientes</h1>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Gestión de cartera, sucursales y cuentas corrientes</p>
        </div>
        <button 
          onClick={handleCreateNew}
          className="bg-sleek-dark hover:bg-slate-800 text-white px-8 py-3 rounded-lg font-black text-xs uppercase tracking-widest transition-all shadow-lg hover:shadow-2xl flex items-center gap-3"
        >
          <Plus className="w-5 h-5" /> Nuevo Cliente
        </button>
      </div>

      <Card className="p-4 bg-white/50 backdrop-blur-sm border-none shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar por Razón Social, CUIT, Email..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-slate-100 rounded-xl focus:ring-2 focus:ring-sleek-accent outline-none text-sm font-bold text-slate-700 transition-all shadow-inner"
            />
          </div>
          <div>
            <select 
              value={filterCanal}
              onChange={(e) => setFilterCanal(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl focus:ring-2 focus:ring-sleek-accent outline-none text-xs font-black uppercase text-slate-500"
            >
              <option value="Todos">Todos los Canales</option>
              <option value="Distribuidor">Distribuidores</option>
              <option value="Comercio">Comercios</option>
              <option value="Particular">Particulares</option>
              <option value="Otro">Otros</option>
            </select>
          </div>
          <div className="flex gap-2">
            <select 
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
              className="flex-1 px-4 py-3 bg-white border border-slate-100 rounded-xl focus:ring-2 focus:ring-sleek-accent outline-none text-xs font-black uppercase text-slate-500"
            >
              <option value="Activo">Activos</option>
              <option value="Inactivo">Inactivos</option>
              <option value="Todos">Todos los Estados</option>
            </select>
            <button className="p-3 bg-sleek-accent/10 text-sleek-accent rounded-xl hover:bg-sleek-accent/20 transition-all">
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden border-none shadow-xl rounded-2xl bg-white/80 backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-5 text-left text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100">Cliente</th>
                <th className="px-8 py-5 text-left text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100">Canal / Lista</th>
                <th className="px-8 py-5 text-left text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100 text-center">Sucs.</th>
                <th className="px-8 py-5 text-left text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100">Cond. Pago</th>
                <th className="px-8 py-5 text-right text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100">Saldo Pend.</th>
                <th className="px-8 py-5 text-center text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100">Estado</th>
                <th className="px-8 py-5 text-right text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredClientes.map((cliente: any) => {
                const saldo = getSaldoPendiente(cliente.id);
                const lp = listasPrecios.find((l: any) => l.id === cliente.listaPrecioId);
                
                return (
                  <tr key={cliente.id} className="hover:bg-sleek-accent/5 transition-all group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded shadow-inner bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:text-sleek-accent transition-all ring-1 ring-slate-100 group-hover:ring-sleek-accent/20">
                          <Users className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-[13px] font-black text-sleek-dark uppercase group-hover:text-sleek-accent transition-colors">{cliente.razonSocial}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{cliente.cuit || 'Sin CUIT'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="space-y-1.5">
                        <Badge variant={cliente.canal === 'Distribuidor' ? 'info' : cliente.canal === 'Comercio' ? 'success' : 'warning'}>
                          {cliente.canal}
                        </Badge>
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{lp?.nombre || '-'}</p>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <div className="inline-flex items-center justify-center w-7 h-7 rounded bg-slate-100 text-[10px] font-black text-slate-600">
                        {cliente.sucursales.length}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{cliente.condicionPago}</p>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <p className={cn(
                        "text-[13px] font-black",
                        saldo === 0 ? "text-sleek-success" : 
                        cliente.topeCredito && saldo > cliente.topeCredito ? "text-sleek-danger" : 
                        cliente.topeCredito && saldo > cliente.topeCredito * 0.8 ? "text-sleek-warning" : "text-sleek-dark"
                      )}>
                        $ {saldo.toLocaleString()}
                      </p>
                      {cliente.topeCredito > 0 && (
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Tope: {cliente.topeCredito.toLocaleString()}</p>
                      )}
                    </td>
                    <td className="px-8 py-5 text-center">
                      <Badge variant={cliente.estado === 'Activo' ? 'success' : 'default'}>
                        {cliente.estado}
                      </Badge>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-1 translate-x-2 group-hover:translate-x-0 transition-all opacity-0 group-hover:opacity-100">
                        <button 
                          onClick={() => { setSelectedCliente(cliente); setView('detail'); }}
                          className="p-2.5 text-slate-400 hover:text-sleek-accent hover:bg-sleek-accent/10 rounded-lg transition-all"
                          title="Ver Detalle"
                        >
                          <Eye className="w-4.5 h-4.5" />
                        </button>
                        <button 
                          onClick={() => handleEdit(cliente)}
                          className="p-2.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-all"
                          title="Editar"
                        >
                          <Edit2 className="w-4.5 h-4.5" />
                        </button>
                        <button 
                          onClick={() => {
                            const nuevoEstado = cliente.estado === 'Activo' ? 'Inactivo' : 'Activo';
                            setClientes(clientes.map((c: any) => c.id === cliente.id ? { ...c, estado: nuevoEstado } : c));
                            showNotification(`Cliente ${nuevoEstado === 'Activo' ? 'activado' : 'desactivado'}`, 'success');
                          }}
                          className={cn(
                            "p-2.5 rounded-lg transition-all",
                            cliente.estado === 'Activo' ? "text-slate-400 hover:text-sleek-warning hover:bg-sleek-warning/10" : "text-slate-400 hover:text-sleek-success hover:bg-sleek-success/10"
                          )}
                          title={cliente.estado === 'Activo' ? 'Desactivar' : 'Activar'}
                        >
                          <XCircle className="w-4.5 h-4.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredClientes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-8 py-20 text-center">
                    <Users className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest italic">No se encontraron clientes</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {renderModals()}
    </div>
  );
};

const ListasPreciosView = ({ listasPrecios, setListasPrecios, productos, familias, subfamilias, currentUser, showNotification }: any) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'form' | 'adjust'>('form');
  const [editingLista, setEditingLista] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Adjust Prices State
  const [adjustData, setAdjustData] = useState({
    type: 'Aumento' as 'Aumento' | 'Descuento',
    percentage: 0,
    scope: 'Todos',
    scopeId: ''
  });

  const [expandedScales, setExpandedScales] = useState<string | null>(null);

  const filteredListas = listasPrecios.filter((lp: any) => lp.nombre.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleCreateNew = () => {
    setEditingLista({
      id: `lp-${Date.now()}`,
      nombre: '',
      descripcion: '',
      estado: 'Activa',
      productos: productos.map((p: any) => ({ productoId: p.id, precio: 0, escalas: [] })),
      ultimaActualizacion: { fecha: new Date().toISOString(), usuarioId: currentUser.id }
    });
    setModalType('form');
    setIsModalOpen(true);
  };

  const handleDuplicate = (lista: any) => {
    const duplicated = {
      ...lista,
      id: `lp-${Date.now()}`,
      nombre: `${lista.nombre} - Copia`,
      ultimaActualizacion: { fecha: new Date().toISOString(), usuarioId: currentUser.id }
    };
    setListasPrecios([...listasPrecios, duplicated]);
    showNotification('Lista duplicada con éxito', 'success');
  };

  const handleSave = () => {
    if (!editingLista.nombre) {
      showNotification('El nombre es obligatorio', 'error');
      return;
    }
    const updatedLista = {
      ...editingLista,
      ultimaActualizacion: { fecha: new Date().toISOString(), usuarioId: currentUser.id }
    };

    if (listasPrecios.find((lp: any) => lp.id === updatedLista.id)) {
      setListasPrecios(listasPrecios.map((lp: any) => lp.id === updatedLista.id ? updatedLista : lp));
      showNotification('Lista actualizada con éxito', 'success');
    } else {
      setListasPrecios([...listasPrecios, updatedLista]);
      showNotification('Lista creada con éxito', 'success');
    }
    setIsModalOpen(false);
  };

  const handleApplyAdjustment = () => {
    if (!editingLista) return;
    const factor = adjustData.type === 'Aumento' ? 1 + (adjustData.percentage / 100) : 1 - (adjustData.percentage / 100);
    
    const updatedProds = editingLista.productos.map((priceItem: any) => {
      const p = productos.find((prod: any) => prod.id === priceItem.productoId);
      if (!p) return priceItem;

      let apply = false;
      if (adjustData.scope === 'Todos') apply = true;
      else if (adjustData.scope === 'Familia' && p.familiaId === adjustData.scopeId) apply = true;
      else if (adjustData.scope === 'Subfamilia' && p.subfamiliaId === adjustData.scopeId) apply = true;

      if (apply) {
        return { ...priceItem, precio: priceItem.precio * factor };
      }
      return priceItem;
    });

    setEditingLista({ ...editingLista, productos: updatedProds });
    setModalType('form');
    showNotification('Ajuste de precios pre-aplicado. Guarda para confirmar.', 'success');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-sleek-dark uppercase tracking-widest">Listas de Precios</h1>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Gestión multicanal de precios y descuentos masivos</p>
        </div>
        <button 
          onClick={handleCreateNew}
          className="bg-sleek-dark hover:bg-slate-800 text-white px-8 py-3 rounded-lg font-black text-xs uppercase tracking-widest transition-all shadow-lg hover:shadow-2xl flex items-center gap-3"
        >
          <Plus className="w-5 h-5" /> Nueva Lista
        </button>
      </div>

      <Card className="p-4 bg-white/50 border-none shadow-sm flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar por nombre de lista..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-100 rounded-xl focus:ring-2 focus:ring-sleek-accent outline-none text-sm font-bold text-slate-700 transition-all shadow-inner"
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredListas.map((lp: any) => (
          <Card key={lp.id} className="group hover:shadow-2xl transition-all border-none">
            <div className="p-8 border-b border-slate-50 relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 translate-x-4 -translate-y-4 group-hover:translate-x-0 group-hover:translate-y-0 transition-all opacity-0 group-hover:opacity-100 flex gap-2">
                  <button onClick={() => handleDuplicate(lp)} className="p-2 bg-white shadow-lg rounded-lg text-slate-400 hover:text-sky-600">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setEditingLista({ ...lp }); setModalType('form'); setIsModalOpen(true); }} className="p-2 bg-white shadow-lg rounded-lg text-slate-400 hover:text-sleek-accent">
                    <Edit2 className="w-4 h-4" />
                  </button>
               </div>
               
               <Badge variant={lp.estado === 'Activa' ? 'success' : 'default'} className="mb-4">{lp.estado}</Badge>
               <h3 className="text-lg font-black text-sleek-dark uppercase mb-2">{lp.nombre}</h3>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight line-clamp-2 min-h-[32px]">
                {lp.descripcion || 'Sin descripción adicional'}
               </p>
            </div>
            <div className="p-8 bg-slate-50/50 space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Productos vinculados</p>
                <p className="text-sm font-black text-sleek-dark">{lp.productos.length}</p>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Última Actualización</p>
                <p className="text-[10px] font-black text-slate-600">{safeFormat(lp.ultimaActualizacion?.fecha, 'dd/MM/yyyy')}</p>
              </div>
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-sleek-dark flex items-center justify-center text-[10px] text-white font-bold">
                    {lp.ultimaActualizacion?.usuarioId.charAt(0)}
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Por Admin</p>
                </div>
                <button 
                  onClick={() => { setEditingLista({ ...lp }); setModalType('form'); setIsModalOpen(true); }}
                  className="text-[10px] font-black uppercase text-sleek-accent tracking-widest flex items-center gap-2 hover:gap-3 transition-all"
                >
                  Gestionar Precios <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={modalType === 'form' ? 'Gestionar Lista de Precios' : 'Ajuste Masivo de Precios'}>
        {modalType === 'form' && editingLista && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-8 border-b border-slate-100">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nombre de la Lista *</label>
                <input 
                  type="text" 
                  value={editingLista.nombre}
                  onChange={(e) => setEditingLista({ ...editingLista, nombre: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
                  placeholder="Ej: Mayorista, Minorista..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado</label>
                <select 
                  value={editingLista.estado}
                  onChange={(e) => setEditingLista({ ...editingLista, estado: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
                >
                  <option value="Activa">Activa</option>
                  <option value="Inactiva">Inactiva</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-bold text-sleek-dark uppercase tracking-widest flex items-center gap-3">
                  <DollarSign className="w-4 h-4 text-sleek-accent" /> Productos y Precios
                </h3>
                <button 
                  onClick={() => setModalType('adjust')}
                  className="flex items-center gap-2 px-4 py-2 bg-sleek-accent/10 border border-sleek-accent/20 text-sleek-accent rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                >
                  <TrendingUp className="w-3 h-3" /> Ajustar Precios
                </button>
              </div>
              
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {editingLista.productos.map((priceItem: any, idx: number) => {
                  const p = productos.find((prod: any) => prod.id === priceItem.productoId);
                  if (!p) return null;
                  return (
                      <div className="flex flex-col p-4 bg-slate-50 rounded-xl border border-slate-100 group">
                        <div className="flex flex-col md:flex-row md:items-center justify-between mb-3 md:mb-0">
                          <div className="flex items-center gap-4 mb-3 md:mb-0">
                            <div className="w-10 h-10 rounded shadow-inner bg-white flex items-center justify-center text-slate-300">
                              <Package className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-[11px] font-black text-sleek-dark uppercase line-clamp-1">{p.nombre}</p>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{p.codigo} | {p.unidadMedidaId === 'u1' ? 'KG' : 'UN'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {(!priceItem.escalas || priceItem.escalas.length === 0) ? (
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                <input 
                                  type="number" 
                                  step="0.01"
                                  value={priceItem.precio}
                                  onChange={(e) => {
                                    const news = [...editingLista.productos];
                                    news[idx] = { ...news[idx], precio: parseFloat(e.target.value) || 0 };
                                    setEditingLista({ ...editingLista, productos: news });
                                  }}
                                  className="pl-8 pr-4 py-2 w-32 bg-white border border-slate-200 rounded focus:ring-1 focus:ring-sleek-accent outline-none font-black text-sm text-right"
                                />
                              </div>
                            ) : (
                              <div className="bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded text-[10px] font-black uppercase text-amber-600 flex items-center gap-2">
                                <Layers className="w-3 h-3" /> {priceItem.escalas.length} Escalas
                              </div>
                            )}
                            
                            <button 
                              onClick={() => setExpandedScales(expandedScales === priceItem.productoId ? null : priceItem.productoId)}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-sm border",
                                expandedScales === priceItem.productoId 
                                  ? "bg-sleek-dark text-white border-sleek-dark" 
                                  : "bg-white text-slate-500 border-slate-200 hover:border-sleek-accent"
                              )}
                            >
                              <TrendingUp className="w-3 h-3" />
                              {expandedScales === priceItem.productoId ? 'Cerrar' : 'Escalas'}
                            </button>

                            <button 
                              onClick={() => {
                                setEditingLista({
                                  ...editingLista,
                                  productos: editingLista.productos.filter((pItem: any) => pItem.productoId !== priceItem.productoId)
                                });
                              }}
                              className="p-2 text-slate-300 hover:text-sleek-danger"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Panel de Escalas */}
                        {expandedScales === priceItem.productoId && (
                          <div className="mt-4 pt-4 border-t border-slate-200 animate-in slide-in-from-top-2 duration-300">
                             <div className="flex justify-between items-center mb-4">
                               <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Configuración de Precios por Cantidad</p>
                               <button 
                                 onClick={() => {
                                   const news = [...editingLista.productos];
                                   const escalas = [...(priceItem.escalas || [])];
                                   const lastHasta = escalas.length > 0 ? escalas[escalas.length - 1].hasta : 0;
                                   escalas.push({ desde: lastHasta + 0.01, hasta: lastHasta + 10, precio: priceItem.precio });
                                   news[idx] = { ...news[idx], escalas };
                                   setEditingLista({ ...editingLista, productos: news });
                                 }}
                                 className="text-[9px] font-black uppercase text-sleek-accent hover:underline flex items-center gap-1"
                               >
                                 <Plus className="w-3 h-3" /> Agregar Rango
                               </button>
                             </div>
                             
                             <div className="space-y-2">
                                {(priceItem.escalas || []).map((esc: any, escIdx: number) => (
                                  <div key={escIdx} className="grid grid-cols-4 gap-4 items-end bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                                     <div className="space-y-1">
                                        <label className="text-[8px] font-bold text-slate-400 uppercase">Desde</label>
                                        <input 
                                          type="number" 
                                          value={esc.desde}
                                          onChange={(e) => {
                                            const news = [...editingLista.productos];
                                            const escalas = [...news[idx].escalas];
                                            escalas[escIdx] = { ...escalas[escIdx], desde: parseFloat(e.target.value) || 0 };
                                            news[idx] = { ...news[idx], escalas };
                                            setEditingLista({ ...editingLista, productos: news });
                                          }}
                                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-100 rounded text-[11px] font-black outline-none focus:ring-1 focus:ring-sleek-accent"
                                        />
                                     </div>
                                     <div className="space-y-1">
                                        <label className="text-[8px] font-bold text-slate-400 uppercase">Hasta</label>
                                        <input 
                                          type="number" 
                                          value={esc.hasta}
                                          onChange={(e) => {
                                            const news = [...editingLista.productos];
                                            const escalas = [...news[idx].escalas];
                                            escalas[escIdx] = { ...escalas[escIdx], hasta: parseFloat(e.target.value) || 0 };
                                            news[idx] = { ...news[idx], escalas };
                                            setEditingLista({ ...editingLista, productos: news });
                                          }}
                                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-100 rounded text-[11px] font-black outline-none focus:ring-1 focus:ring-sleek-accent"
                                        />
                                     </div>
                                     <div className="space-y-1">
                                        <label className="text-[8px] font-bold text-slate-400 uppercase">Precio ($)</label>
                                        <input 
                                          type="number" 
                                          value={esc.precio}
                                          onChange={(e) => {
                                            const news = [...editingLista.productos];
                                            const escalas = [...news[idx].escalas];
                                            escalas[escIdx] = { ...escalas[escIdx], precio: parseFloat(e.target.value) || 0 };
                                            news[idx] = { ...news[idx], escalas };
                                            setEditingLista({ ...editingLista, productos: news });
                                          }}
                                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-100 rounded text-[11px] font-black outline-none focus:ring-1 focus:ring-sleek-accent text-right"
                                        />
                                     </div>
                                     <div className="flex items-center justify-end h-full pt-4">
                                        <button 
                                          onClick={() => {
                                            const news = [...editingLista.productos];
                                            const escalas = [...news[idx].escalas];
                                            escalas.splice(escIdx, 1);
                                            news[idx] = { ...news[idx], escalas };
                                            setEditingLista({ ...editingLista, productos: news });
                                          }}
                                          className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                     </div>
                                  </div>
                                ))}

                                {(!priceItem.escalas || priceItem.escalas.length === 0) && (
                                  <div className="py-6 text-center border border-dashed border-slate-200 rounded-xl">
                                     <p className="text-[9px] font-bold text-slate-400 uppercase italic">Sin escalas configuradas para este producto</p>
                                  </div>
                                )}

                                {/* Validación de superposición visual básica */}
                                {priceItem.escalas?.some((esc: any, i: number) => 
                                  priceItem.escalas.some((esc2: any, j: number) => 
                                    i !== j && (
                                      (esc.desde >= esc2.desde && esc.desde <= esc2.hasta) ||
                                      (esc.hasta >= esc2.desde && esc.hasta <= esc2.hasta)
                                    )
                                  )
                                ) && (
                                  <div className="p-2 bg-amber-50 text-amber-600 rounded text-[9px] font-bold uppercase tracking-widest flex items-center gap-2">
                                     <AlertCircle className="w-3 h-3" /> Atención: Existen rangos superpuestos
                                  </div>
                                )}
                             </div>
                          </div>
                        )}
                      </div>
                  );
                })}
              </div>

              <div className="mt-6 pt-6 border-t border-slate-100">
                <button 
                   onClick={() => {
                     // Add all missing products logic can be here
                     const alreadyIds = editingLista.productos.map((p: any) => p.productoId);
                     const missing = productos.filter((p: any) => !alreadyIds.includes(p.id))
                       .map((p: any) => ({ productoId: p.id, precio: 0, escalas: [] }));
                     
                     if (missing.length === 0) {
                        showNotification('Todos los productos ya están en la lista', 'info');
                     } else {
                        setEditingLista({
                          ...editingLista,
                          productos: [...editingLista.productos, ...missing]
                        });
                        showNotification(`${missing.length} productos agregados`, 'success');
                     }
                   }}
                   className="w-full py-4 border-2 border-dashed border-slate-200 hover:border-sleek-accent hover:bg-sleek-accent/5 transition-all text-slate-400 hover:text-sleek-accent rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3"
                >
                  <Plus className="w-4 h-4" /> Agregar todos los productos faltantes
                </button>
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black rounded-xl uppercase tracking-widest text-[10px]"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSave}
                className="flex-[2] py-4 bg-sleek-dark hover:bg-slate-800 text-white font-black rounded-xl shadow-xl uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" /> Guardar Lista de Precios
              </button>
            </div>
          </div>
        )}

        {modalType === 'adjust' && (
          <div className="space-y-8 animate-in zoom-in-95 duration-300">
             <div className="p-6 bg-sleek-accent/5 rounded-xl border border-sleek-accent/10">
                <p className="text-xs font-bold text-sleek-dark mb-2">Ajuste Masivo de Precios</p>
                <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                  Utiliza esta herramienta para actualizar rápidamente los precios de esta lista basándote en porcentajes. Los cambios se aplicarán sobre los valores actuales.
                </p>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tipo de Ajuste</label>
                  <div className="flex p-1 bg-slate-100 rounded-lg">
                    <button 
                      onClick={() => setAdjustData({ ...adjustData, type: 'Aumento' })}
                      className={cn("flex-1 py-2 rounded font-black text-[10px] uppercase transition-all", adjustData.type === 'Aumento' ? "bg-white text-sleek-dark shadow-sm" : "hover:text-slate-800")}
                    >Aumento</button>
                    <button 
                      onClick={() => setAdjustData({ ...adjustData, type: 'Descuento' })}
                      className={cn("flex-1 py-2 rounded font-black text-[10px] uppercase transition-all", adjustData.type === 'Descuento' ? "bg-white text-sleek-dark shadow-sm" : "hover:text-slate-800")}
                    >Descuento</button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Porcentaje (%)</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={adjustData.percentage}
                      onChange={(e) => setAdjustData({ ...adjustData, percentage: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
                    />
                    <Tag className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Alcance / Aplicar a</label>
                  <select 
                    value={adjustData.scope}
                    onChange={(e) => setAdjustData({ ...adjustData, scope: e.target.value, scopeId: '' })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
                  >
                    <option value="Todos">Todos los Productos</option>
                    <option value="Familia">Por Familia</option>
                    <option value="Subfamilia">Por Subfamilia</option>
                  </select>
                </div>
                {adjustData.scope !== 'Todos' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Seleccionar {adjustData.scope}</label>
                    <select 
                      value={adjustData.scopeId}
                      onChange={(e) => setAdjustData({ ...adjustData, scopeId: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
                    >
                      <option value="">Seleccionar...</option>
                      {adjustData.scope === 'Familia' ? (
                        familias.map((f: any) => <option key={f.id} value={f.id}>{f.nombre}</option>)
                      ) : (
                        subfamilias.map((sf: any) => <option key={sf.id} value={sf.id}>{sf.nombre}</option>)
                      )}
                    </select>
                  </div>
                )}
             </div>

             <div className="flex gap-4 pt-4 border-t border-slate-100">
                <button 
                  onClick={() => setModalType('form')}
                  className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black rounded-xl uppercase tracking-widest text-[10px]"
                >
                  Volver a Lista
                </button>
                <button 
                  onClick={handleApplyAdjustment}
                  className="flex-[2] py-4 bg-sleek-accent hover:bg-sleek-accent hover:shadow-xl text-white font-black rounded-xl shadow-lg uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2"
                >
                  <TrendingUp className="w-4 h-4" /> Previsualizar y Aplicar
                </button>
             </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// --- EGRESOS VIEWS ---

const PlanCuentasView = ({ planCuentas, setPlanCuentas, showNotification }: any) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  const getNivelLabel = (nivel: number) => {
    switch (nivel) {
      case 1: return 'Cuenta (Nivel 1)';
      case 2: return 'Subcuenta (Nivel 2)';
      case 3: return 'Detalle (Nivel 3)';
      default: return '';
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...editingItem,
      id: editingItem.id || `pc-${Date.now()}`
    };

    if (planCuentas.find((pc: any) => pc.id === data.id)) {
      setPlanCuentas(planCuentas.map((pc: any) => pc.id === data.id ? data : pc));
      showNotification('Cuenta actualizada', 'success');
    } else {
      setPlanCuentas([...planCuentas, data]);
      showNotification('Cuenta creada con éxito', 'success');
    }
    setIsModalOpen(false);
  };

  const tree = planCuentas
    .filter((pc: any) => pc.nivel === 1)
    .sort((a: any, b: any) => a.codigo.localeCompare(b.codigo));

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-sleek-dark uppercase tracking-tighter">Plan de Cuentas</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Estructura contable de egresos</p>
        </div>
        <button 
          onClick={() => { setEditingItem({ codigo: '', nombre: '', nivel: 1, parentId: null, estado: 'Activa' }); setIsModalOpen(true); }}
          className="bg-sleek-dark text-white px-6 py-3 rounded text-[10px] font-black uppercase tracking-widest shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all flex items-center gap-3"
        >
          <Plus className="w-4 h-4" /> Nueva Cuenta Nivel 1
        </button>
      </div>

      <Card className="p-0 border-none shadow-xl overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-100 p-4 grid grid-cols-12 gap-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
          <div className="col-span-2">Código</div>
          <div className="col-span-6">Nombre de la Cuenta</div>
          <div className="col-span-2">Nivel</div>
          <div className="col-span-2 text-right">Acciones</div>
        </div>
        <div className="divide-y divide-slate-50">
          {tree.map((nivel1: any) => (
            <React.Fragment key={nivel1.id}>
              {/* Nivel 1 */}
              <div className="p-4 grid grid-cols-12 gap-4 items-center bg-white hover:bg-slate-50 transition-colors">
                <div className="col-span-2 font-black text-sleek-dark text-xs">{nivel1.codigo}</div>
                <div className="col-span-6 font-black text-sleek-dark flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-sleek-accent" /> {nivel1.nombre}
                </div>
                <div className="col-span-2">
                  <Badge variant="info">NIVEL 1</Badge>
                </div>
                <div className="col-span-2 flex justify-end gap-2">
                  <button 
                    onClick={() => { setEditingItem({ codigo: '', nombre: '', nivel: 2, parentId: nivel1.id, estado: 'Activa' }); setIsModalOpen(true); }}
                    title="Agregar Subcuenta"
                    className="p-2 hover:bg-emerald-50 text-emerald-600 rounded transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setEditingItem(nivel1); setIsModalOpen(true); }} className="p-2 hover:bg-sleek-accent/10 text-sleek-accent rounded transition-colors"><Edit2 className="w-4 h-4" /></button>
                </div>
              </div>
              {/* Nivel 2 */}
              {planCuentas.filter((pc: any) => pc.parentId === nivel1.id).map((nivel2: any) => (
                <React.Fragment key={nivel2.id}>
                  <div className="p-4 grid grid-cols-12 gap-4 items-center bg-slate-50/30 hover:bg-slate-50 transition-colors ml-8 border-l-2 border-slate-100">
                    <div className="col-span-2 font-bold text-slate-500 text-[11px]">{nivel2.codigo}</div>
                    <div className="col-span-6 font-bold text-slate-700 flex items-center gap-2 pl-4">
                      <ChevronRight className="w-3 h-3 text-slate-300" /> {nivel2.nombre}
                    </div>
                    <div className="col-span-2">
                      <Badge variant="warning">NIVEL 2</Badge>
                    </div>
                    <div className="col-span-2 flex justify-end gap-2">
                      <button 
                         onClick={() => { setEditingItem({ codigo: '', nombre: '', nivel: 3, parentId: nivel2.id, estado: 'Activa' }); setIsModalOpen(true); }}
                         title="Agregar Detalle"
                         className="p-2 hover:bg-emerald-50 text-emerald-600 rounded transition-colors"
                      >
                         <Plus className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setEditingItem(nivel2); setIsModalOpen(true); }} className="p-2 hover:bg-sleek-accent/10 text-sleek-accent rounded transition-colors"><Edit2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  {/* Nivel 3 */}
                  {planCuentas.filter((pc: any) => pc.parentId === nivel2.id).map((nivel3: any) => (
                    <div key={nivel3.id} className="p-4 grid grid-cols-12 gap-4 items-center bg-white hover:bg-slate-50 transition-colors ml-16 border-l-2 border-slate-50">
                      <div className="col-span-2 font-medium text-slate-400 text-[11px]">{nivel3.codigo}</div>
                      <div className="col-span-6 text-slate-600 flex items-center gap-2 pl-8">
                        <span className="w-1.5 h-1.5 rounded-full bg-sleek-accent opacity-40"></span> {nivel3.nombre}
                      </div>
                      <div className="col-span-2">
                        <Badge variant="default">NIVEL 3</Badge>
                      </div>
                      <div className="col-span-2 flex justify-end gap-2">
                        <button onClick={() => { setEditingItem(nivel3); setIsModalOpen(true); }} className="p-2 hover:bg-sleek-accent/10 text-sleek-accent rounded transition-colors"><Edit2 className="w-4 h-4" /></button>
                        <button 
                          onClick={() => {
                            confirmDialog('¿Está seguro de eliminar esta cuenta?', () => {
                              setPlanCuentas(planCuentas.filter((pc: any) => pc.id !== nivel3.id));
                              showNotification('Cuenta eliminada', 'success');
                            });
                          }}
                          className="p-2 hover:bg-sleek-danger/10 text-sleek-danger rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </React.Fragment>
          ))}
        </div>
      </Card>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem?.id ? 'Editar Cuenta' : `Nueva ${getNivelLabel(editingItem?.nivel)}`}>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Código *</label>
              <input 
                type="text" required
                value={editingItem?.codigo || ''}
                onChange={(e) => setEditingItem({ ...editingItem, codigo: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
                placeholder="Ej: 5.101"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado</label>
              <select 
                value={editingItem?.estado || 'Activa'}
                onChange={(e) => setEditingItem({ ...editingItem, estado: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
              >
                <option value="Activa">Activa</option>
                <option value="Inactiva">Inactiva</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nombre de la Cuenta *</label>
            <input 
              type="text" required
              value={editingItem?.nombre || ''}
              onChange={(e) => setEditingItem({ ...editingItem, nombre: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
              placeholder="Ej: Compras Materia Prima"
            />
          </div>
          <div className="flex gap-4 pt-4">
            <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-black rounded-xl uppercase tracking-widest text-[10px]">Cancelar</button>
            <button type="submit" className="flex-[2] py-4 bg-sleek-dark text-white font-black rounded-xl shadow-xl uppercase tracking-widest text-[10px]">Guardar Cuenta</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const TiposEgresoView = ({ tiposEgreso, setTiposEgreso, planCuentas, showNotification }: any) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...editingItem,
      id: editingItem.id || `te-${Date.now()}`
    };

    if (tiposEgreso.find((te: any) => te.id === data.id)) {
      setTiposEgreso(tiposEgreso.map((te: any) => te.id === data.id ? data : te));
      showNotification('Tipo de egreso actualizado', 'success');
    } else {
      setTiposEgreso([...tiposEgreso, data]);
      showNotification('Tipo de egreso creado', 'success');
    }
    setIsModalOpen(false);
  };

  const cuentasNivel3 = planCuentas.filter((pc: any) => pc.nivel === 3);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-sleek-dark uppercase tracking-tighter">Tipos de Egreso</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Configuración y categorización</p>
        </div>
        <button 
          onClick={() => { setEditingItem({ nombre: '', color: 'blue', impactaInventario: false, estado: 'Activo' }); setIsModalOpen(true); }}
          className="bg-sleek-dark text-white px-6 py-3 rounded text-[10px] font-black uppercase tracking-widest shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all flex items-center gap-3"
        >
          <Plus className="w-4 h-4" /> Nuevo Tipo de Egreso
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tiposEgreso.map((tipo: any) => (
          <Card key={tipo.id} className="p-6 relative group border-slate-100">
            <div className={`absolute top-0 right-0 w-2 h-full bg-${tipo.color}-500 rounded-r`}></div>
            <div className="flex justify-between items-start mb-4">
              <div className={`w-10 h-10 rounded-xl bg-${tipo.color}-500/10 flex items-center justify-center text-${tipo.color}-600`}>
                <Tag className="w-5 h-5" />
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => { setEditingItem(tipo); setIsModalOpen(true); }} className="p-2 hover:bg-slate-100 rounded text-slate-400 hover:text-sleek-accent"><Edit2 className="w-3.5 h-3.5" /></button>
                <button 
                   onClick={() => {
                     confirmDialog('¿Eliminar tipo de egreso?', () => {
                       setTiposEgreso(tiposEgreso.filter((t: any) => t.id !== tipo.id));
                       showNotification('Eliminado', 'success');
                     });
                   }}
                   className="p-2 hover:bg-slate-100 rounded text-slate-400 hover:text-sleek-danger"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <h3 className="font-black text-sleek-dark uppercase text-sm mb-1">{tipo.nombre}</h3>
            {tipo.cuentaContableDefectoId && (
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <FolderTree className="w-3 h-3" /> {planCuentas.find((pc: any) => pc.id === tipo.cuentaContableDefectoId)?.nombre}
              </p>
            )}
            <div className="mt-4 flex items-center gap-3">
              {tipo.impactaInventario ? (
                <Badge variant="success" className="bg-emerald-50! text-emerald-600!">Impacta Inventario</Badge>
              ) : (
                <Badge variant="default" className="bg-slate-50! text-slate-400!">Sin Inventario</Badge>
              )}
              <Badge variant={tipo.estado === 'Activo' ? 'success' : 'danger'}>{tipo.estado}</Badge>
            </div>
          </Card>
        ))}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Configurar Tipo de Egreso">
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nombre *</label>
            <input 
              type="text" required
              value={editingItem?.nombre || ''}
              onChange={(e) => setEditingItem({ ...editingItem, nombre: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Color Sugerido</label>
              <select 
                value={editingItem?.color || 'blue'}
                onChange={(e) => setEditingItem({ ...editingItem, color: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
              >
                <option value="blue">Azul</option>
                <option value="emerald">Verde</option>
                <option value="rose">Rosa</option>
                <option value="amber">Ambar</option>
                <option value="violet">Violeta</option>
                <option value="sky">Celeste</option>
                <option value="slate">Gris</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado</label>
              <select 
                value={editingItem?.estado || 'Activo'}
                onChange={(e) => setEditingItem({ ...editingItem, estado: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
              >
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cuenta Contable por Defecto</label>
            <select 
              value={editingItem?.cuentaContableDefectoId || ''}
              onChange={(e) => setEditingItem({ ...editingItem, cuentaContableDefectoId: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
            >
              <option value="">Seleccionar Cuenta Nivel 3...</option>
              {cuentasNivel3.map((pc: any) => (
                <option key={pc.id} value={pc.id}>{pc.codigo} - {pc.nombre}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
            <input 
              type="checkbox"
              id="impactaInventario"
              checked={editingItem?.impactaInventario || false}
              onChange={(e) => setEditingItem({ ...editingItem, impactaInventario: e.target.checked })}
              className="w-5 h-5 rounded border-slate-300 text-sleek-accent focus:ring-sleek-accent"
            />
            <label htmlFor="impactaInventario" className="text-xs font-bold text-sleek-dark uppercase select-none">Impacta en Inventario (Compra de Productos)</label>
          </div>
          <div className="flex gap-4 pt-4">
            <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-black rounded-xl uppercase tracking-widest text-[10px]">Cancelar</button>
            <button type="submit" className="flex-[2] py-4 bg-sleek-dark text-white font-black rounded-xl shadow-xl uppercase tracking-widest text-[10px]">Guardar Tipo</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const ProveedoresView = ({ proveedores, setProveedores, pagosProveedores, setPagosProveedores, egresos, tiposEgreso, planCuentas, showNotification }: any) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPagoModalOpen, setIsPagoModalOpen] = useState(false);
  const [selectedProveedor, setSelectedProveedor] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [pagoData, setPagoData] = useState<any>({ monto: 0, metodo: 'Transferencia' });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...editingItem,
      id: editingItem.id || `pr-${Date.now()}`
    };

    if (proveedores.find((p: any) => p.id === data.id)) {
      setProveedores(proveedores.map((p: any) => p.id === data.id ? data : p));
      showNotification('Proveedor actualizado', 'success');
    } else {
      setProveedores([...proveedores, data]);
      showNotification('Proveedor creado con éxito', 'success');
    }
    setIsModalOpen(false);
  };

  const calculateSaldo = (proveedorId: string) => {
    const totalEgresos = egresos
      .filter((e: any) => e.proveedorId === proveedorId && e.estado === 'Confirmado')
      .reduce((sum: number, e: any) => sum + e.total, 0);
    const totalPagos = pagosProveedores
      .filter((p: any) => p.proveedorId === proveedorId)
      .reduce((sum: number, p: any) => sum + p.monto, 0);
    return totalEgresos - totalPagos;
  };

  const handleSavePago = (e: React.FormEvent) => {
    e.preventDefault();
    const newPago: PagoProveedor = {
      id: `pago-pr-${Date.now()}`,
      proveedorId: selectedProveedor.id,
      fecha: new Date().toISOString().split('T')[0],
      monto: pagoData.monto,
      metodo: pagoData.metodo,
      referencia: pagoData.referencia,
      comprobante: `OP-${format(new Date(), 'yyyyMMdd')}-${(pagosProveedores.length + 1).toString().padStart(3, '0')}`,
      observaciones: pagoData.observaciones
    };

    setPagosProveedores([...pagosProveedores, newPago]);
    showNotification('Pago registrado con éxito', 'success');
    setIsPagoModalOpen(false);
    printOrdenPago(newPago, selectedProveedor);
  };

  const filtered = proveedores.filter((p: any) => 
    p.razonSocial.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.rubro.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.cuit && p.cuit.includes(searchTerm))
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {selectedProveedor ? (
        <div className="space-y-8 animate-in slide-in-from-right duration-500">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSelectedProveedor(null)}
              className="p-3 bg-white rounded-xl shadow hover:bg-slate-50 text-slate-400 group transition-all"
            >
              <ChevronRight className="w-5 h-5 rotate-180 group-hover:-translate-x-1 transition-transform" />
            </button>
            <div>
              <h2 className="text-2xl font-black text-sleek-dark uppercase tracking-tighter">{selectedProveedor.razonSocial}</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Ficha Detallada del Proveedor</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="p-6 bg-sleek-dark text-white border-none shadow-2xl overflow-visible relative">
              <div className="absolute -top-4 -right-4 w-12 h-12 bg-sleek-accent rounded-2xl shadow-xl flex items-center justify-center transform rotate-12">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <p className="text-[10px] font-black uppercase text-white/50 tracking-widest mb-2">Saldo Adeudado</p>
              <h3 className="text-3xl font-black tracking-tighter">$ {calculateSaldo(selectedProveedor.id).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</h3>
              <button 
                onClick={() => { setPagoData({ monto: calculateSaldo(selectedProveedor.id), metodo: 'Transferencia' }); setIsPagoModalOpen(true); }}
                className="mt-6 w-full py-4 bg-sleek-accent hover:bg-emerald-400 transition-all text-white font-black rounded-xl text-[10px] uppercase tracking-widest shadow-lg flex items-center justify-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" /> Registrar Pago
              </button>
            </Card>

            <Card className="p-6 md:col-span-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                 <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Información Fiscal</p>
                    <p className="text-sm font-black text-sleek-dark uppercase">CUIT: {selectedProveedor.cuit || 'N/A'}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase">{selectedProveedor.rubro}</p>
                 </div>
                 <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contacto</p>
                    <p className="text-sm font-black text-sleek-dark">{selectedProveedor.contacto || 'Sin contacto'}</p>
                    <p className="text-[11px] font-bold text-slate-500">{selectedProveedor.telefono || '-'} | {selectedProveedor.email || '-'}</p>
                 </div>
                 <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Condición Comercial</p>
                    <p className="text-sm font-black text-sleek-dark uppercase">{selectedProveedor.condicionPago}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Plazo: {selectedProveedor.plazoPagoHabitual || 0} DÍAS</p>
                 </div>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-4">
               <h3 className="text-sm font-black text-sleek-dark uppercase tracking-widest flex items-center gap-3">
                  <Receipt className="w-5 h-5 text-sleek-accent" /> Historial de Movimientos (CC)
               </h3>
               <div className="h-px flex-1 bg-slate-100"></div>
            </div>

            <Card className="border-none shadow-xl overflow-hidden">
               <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Transacción</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Comprobante</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Monto</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[
                      ...egresos.filter((e: any) => e.proveedorId === selectedProveedor.id && e.estado === 'Confirmado').map((e: any) => ({ ...e, type: 'EGRESO' })),
                      ...pagosProveedores.filter((p: any) => p.proveedorId === selectedProveedor.id).map((p: any) => ({ ...p, type: 'PAGO' }))
                    ].sort((a: any, b: any) => b.fecha.localeCompare(a.fecha))
                    .map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                           <p className="text-[11px] font-black text-sleek-dark">{format(parseISO(item.fecha), 'dd/MM/yyyy')}</p>
                        </td>
                        <td className="px-6 py-4">
                           {item.type === 'EGRESO' ? (
                              <Badge variant="danger" className="bg-rose-50! text-rose-600!">Cargo (Compra)</Badge>
                           ) : (
                              <Badge variant="success" className="bg-emerald-50! text-emerald-600!">Pago Proveedor</Badge>
                           )}
                        </td>
                        <td className="px-6 py-4">
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.comprobante}</p>
                        </td>
                        <td className={`px-6 py-4 text-right font-black text-xs ${item.type === 'EGRESO' ? 'text-rose-600' : 'text-emerald-600'}`}>
                           {item.type === 'EGRESO' ? '-' : '+'} $ {item.monto?.toLocaleString('es-AR', { minimumFractionDigits: 2 }) || (item.total?.toLocaleString('es-AR', { minimumFractionDigits: 2 }))}
                        </td>
                        <td className="px-6 py-4 text-right">
                           {item.type === 'PAGO' && (
                              <button 
                                onClick={() => printOrdenPago(item, selectedProveedor)}
                                className="p-2 hover:bg-slate-200 rounded text-slate-400 transition-all"
                                title="Imprimir Comprobante"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                           )}
                        </td>
                      </tr>
                    ))}
                    {egresos.filter((e: any) => e.proveedorId === selectedProveedor.id).length === 0 && pagosProveedores.filter((p: any) => p.proveedorId === selectedProveedor.id).length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-20 text-center">
                          <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">Sin movimientos registrados</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
               </table>
            </Card>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-sleek-dark uppercase tracking-tighter">Proveedores</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Gestión de alianzas estratégicas</p>
            </div>
            <div className="flex flex-col md:flex-row gap-3">
               <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"><Search className="w-4 h-4" /></span>
                  <input 
                    type="text"
                    placeholder="Buscar proveedor..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-11 pr-6 py-3 bg-white border border-slate-200 rounded-xl w-full md:w-64 text-xs font-bold focus:ring-2 focus:ring-sleek-accent outline-none shadow-sm"
                  />
               </div>
              <button 
                onClick={() => { setEditingItem({ razonSocial: '', cuit: '', rubro: '', condicionPago: 'Cuenta Corriente', estado: 'Activo' }); setIsModalOpen(true); }}
                className="bg-sleek-dark text-white px-6 py-3 rounded text-[10px] font-black uppercase tracking-widest shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all flex items-center gap-3"
              >
                <Plus className="w-4 h-4" /> Nuevo Proveedor
              </button>
            </div>
          </div>

          <Card className="border-none shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Proveedor</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Rubro</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo Actual</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Condición</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((p: any) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <p className="font-black text-sleek-dark uppercase text-xs">{p.razonSocial}</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest">{p.cuit || 'S/C'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{p.rubro}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className={`text-xs font-black ${calculateSaldo(p.id) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          $ {calculateSaldo(p.id).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={p.condicionPago === 'Contado' ? 'info' : 'warning'}>{p.condicionPago}</Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                           <button 
                            onClick={() => setSelectedProveedor(p)}
                            className="p-2 bg-slate-50 text-slate-400 hover:bg-sleek-accent hover:text-white rounded transition-all shadow-sm"
                            title="Ver Cuenta Corriente"
                           >
                            <Receipt className="w-4 h-4" />
                           </button>
                           <button onClick={() => { setEditingItem(p); setIsModalOpen(true); }} className="p-2 bg-slate-50 text-slate-400 hover:bg-sleek-dark hover:text-white rounded transition-all shadow-sm"><Edit2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem?.id ? 'Editar Proveedor' : 'Nuevo Proveedor'}>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Razón Social *</label>
            <input 
              type="text" required
              value={editingItem?.razonSocial || ''}
              onChange={(e) => setEditingItem({ ...editingItem, razonSocial: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">CUIT</label>
              <input 
                type="text"
                placeholder="Ex: 30-12345678-9"
                value={editingItem?.cuit || ''}
                onChange={(e) => setEditingItem({ ...editingItem, cuit: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Rubro / Categoría</label>
              <input 
                type="text"
                placeholder="Ex: Fletes, Materia Prima..."
                value={editingItem?.rubro || ''}
                onChange={(e) => setEditingItem({ ...editingItem, rubro: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Condición de Pago</label>
              <select 
                value={editingItem?.condicionPago || 'Cuenta Corriente'}
                onChange={(e) => setEditingItem({ ...editingItem, condicionPago: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
              >
                <option value="Cuenta Corriente">Cuenta Corriente</option>
                <option value="Contado">Contado</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado</label>
              <select 
                value={editingItem?.estado || 'Activo'}
                onChange={(e) => setEditingItem({ ...editingItem, estado: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
              >
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
              </select>
            </div>
          </div>
          <div className="space-y-4 pt-4 border-t border-slate-100">
             <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Datos de Contacto (Opcional)</p>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input 
                  type="text" 
                  placeholder="Persona de Contacto"
                  value={editingItem?.contacto || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, contacto: e.target.value })}
                  className="px-4 py-2 text-xs bg-white border border-slate-200 rounded outline-none"
                />
                <input 
                  type="text" 
                  placeholder="Teléfono"
                  value={editingItem?.telefono || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, telefono: e.target.value })}
                  className="px-4 py-2 text-xs bg-white border border-slate-200 rounded outline-none"
                />
             </div>
          </div>
          
          <div className="space-y-4 pt-4 border-t border-slate-100">
             <p className="text-[10px] font-black text-sleek-accent uppercase tracking-[0.2em]">⚙️ CONFIGURACIÓN CONTABLE</p>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tipo de Egreso por defecto</label>
                  <select 
                    value={editingItem?.tipoEgresoDefectoId || ''}
                    onChange={(e) => {
                      const tipo = tiposEgreso.find((t: any) => t.id === e.target.value);
                      setEditingItem({ 
                        ...editingItem, 
                        tipoEgresoDefectoId: e.target.value,
                        cuentaContableDefectoId: tipo?.cuentaContableDefectoId || editingItem.cuentaContableDefectoId
                      });
                    }}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
                  >
                    <option value="">Ninguno</option>
                    {tiposEgreso.map((t: any) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cuenta Contable por defecto</label>
                  <select 
                    value={editingItem?.cuentaContableDefectoId || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, cuentaContableDefectoId: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
                  >
                    <option value="">Ninguna</option>
                    {planCuentas.filter((pc: any) => pc.nivel === 3).map((pc: any) => (
                      <option key={pc.id} value={pc.id}>{pc.nombre}</option>
                    ))}
                  </select>
                </div>
             </div>
             <p className="text-[9px] text-slate-400">Esta configuración se aplicará automáticamente al seleccionar este proveedor en un nuevo egreso.</p>
          </div>
          <div className="flex gap-4 pt-4">
            <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-black rounded-xl uppercase tracking-widest text-[10px]">Cancelar</button>
            <button type="submit" className="flex-[2] py-4 bg-sleek-dark text-white font-black rounded-xl shadow-xl uppercase tracking-widest text-[10px]">Guardar Proveedor</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isPagoModalOpen} onClose={() => setIsPagoModalOpen(false)} title={`Registrar Pago a ${selectedProveedor?.razonSocial}`}>
        <form onSubmit={handleSavePago} className="space-y-6">
           <div className="p-6 bg-sleek-dark text-white rounded-2xl shadow-xl flex flex-col items-center">
              <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-3">Importe a Pagar</p>
              <div className="flex items-center gap-4">
                 <span className="text-2xl font-black text-sleek-accent">$</span>
                 <input 
                  type="number"
                  step="0.01"
                  required
                  autoFocus
                  value={pagoData.monto}
                  onChange={(e) => setPagoData({ ...pagoData, monto: parseFloat(e.target.value) || 0 })}
                  className="bg-transparent border-none outline-none text-5xl font-black tracking-tighter w-48 text-center placeholder:text-white/10"
                 />
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Método de Pago</label>
                <select 
                  value={pagoData.metodo}
                  onChange={(e) => setPagoData({ ...pagoData, metodo: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
                >
                  <option value="Transferencia">Transferencia</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Merca Pago">Mercado Pago</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nro de Referencia / Operación</label>
                <input 
                  type="text"
                  placeholder="Ej: Nro de Transf."
                  value={pagoData.referencia || ''}
                  onChange={(e) => setPagoData({ ...pagoData, referencia: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
                />
              </div>
           </div>

           <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Observaciones Internas</label>
              <textarea 
                rows={3}
                value={pagoData.observaciones || ''}
                onChange={(e) => setPagoData({ ...pagoData, observaciones: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700 resize-none"
                placeholder="Detalla el pago si es necesario..."
              ></textarea>
           </div>

           <div className="flex gap-4 pt-4">
            <button type="button" onClick={() => setIsPagoModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-black rounded-xl uppercase tracking-widest text-[10px]">Cancelar</button>
            <button type="submit" className="flex-[2] py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-xl shadow-xl uppercase tracking-widest text-[10px] flex items-center justify-center gap-3">
              <CheckCircle2 className="w-5 h-5" /> Confirmar Pago e Imprimir OP
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

// --- EGRESOS HELPER ---

const printOrdenPago = (pago: PagoProveedor, proveedor: Proveedor) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const content = `
    <html>
      <head>
        <title>Orden de Pago - ${pago.comprobante}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #334155; line-height: 1.5; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #f1f5f9; padding-bottom: 24px; margin-bottom: 32px; }
          .logo-text { font-size: 24px; font-weight: 900; color: #0f172a; letter-spacing: -0.025em; }
          .doc-type { font-size: 14px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; }
          .comp-nro { font-size: 20px; font-weight: 900; color: #0f172a; }
          .section { margin-bottom: 32px; }
          .section-title { font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
          .label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
          .value { font-size: 14px; font-weight: 700; color: #1e293b; }
          .box { padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px solid #f1f5f9; }
          .total-box { margin-top: 48px; padding: 32px; background: #0f172a; color: white; border-radius: 16px; text-align: right; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
          .total-label { font-size: 12px; font-weight: 700; text-transform: uppercase; opacity: 0.6; }
          .total-value { font-size: 40px; font-weight: 900; letter-spacing: -0.05em; }
          .footer { margin-top: 100px; display: flex; justify-content: space-between; gap: 60px; }
          .signature { border-top: 2px solid #e2e8f0; flex: 1; text-align: center; padding-top: 16px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; }
          @media print { .total-box { background: #0f172a !important; color: white !important; -webkit-print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo-text">ALIDO</div>
            <div class="doc-type">Gestión de Egresos</div>
          </div>
          <div style="text-align: right">
            <div class="doc-type">Orden de Pago</div>
            <div class="comp-nro">${pago.comprobante}</div>
            <div style="font-size: 12px; font-weight: 700; color: #64748b; margin-top: 4px;">Fecha: ${format(parseISO(pago.fecha), 'dd/MM/yyyy')}</div>
          </div>
        </div>

        <div class="section">
          <div class="grid">
            <div class="box">
              <div class="section-title">Destinatario</div>
              <div class="label">Proveedor</div>
              <div class="value">${proveedor.razonSocial}</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 4px; font-weight: 500;">CUIT: ${proveedor.cuit || 'N/A'}</div>
            </div>
            <div class="box">
              <div class="section-title">Detalles de Pago</div>
              <div class="label">Método</div>
              <div class="value">${pago.metodo}</div>
              ${pago.referencia ? `<div class="label" style="margin-top:12px">Referencia</div><div class="value">${pago.referencia}</div>` : ''}
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Concepto / Observaciones</div>
          <div class="box" style="min-height: 120px;">
            <div class="value">${pago.observaciones || 'Pago a cuenta de saldo pendiente en cuenta corriente comercial.'}</div>
          </div>
        </div>

        <div class="total-box">
          <div class="total-label">Importe Total Pagado</div>
          <div class="total-value">$ ${pago.monto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
        </div>

        <div class="footer">
          <div class="signature">Firma Autorizada Alido</div>
          <div class="signature">Recibí Conforme Proveedor</div>
        </div>

        <script>
          window.onload = () => {
            window.print();
            // window.close();
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(content);
  printWindow.document.close();
};

const EgresosView = ({ 
  egresos, setEgresos, 
  tiposEgreso, 
  proveedores, 
  planCuentas, 
  productos,
  almacenes,
  mercaderiaPendiente,
  setMercaderiaPendiente,
  plantillasEgresos,
  setPlantillasEgresos,
  movimientos,
  setMovimientos,
  currentUser,
  showNotification 
}: any) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [filterType, setFilterType] = useState('Todos');
  const [filterStatus, setFilterStatus] = useState('Todos');

  const filtered = egresos.filter((e: any) => {
    const matchesSearch = e.comprobante.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (e.proveedorId && proveedores.find((p: any) => p.id === e.proveedorId)?.razonSocial.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = filterType === 'Todos' || e.tipoEgresoId === filterType;
    const matchesStatus = filterStatus === 'Todos' || e.estado === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  }).sort((a: any, b: any) => b.fecha.localeCompare(a.fecha));

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem.items.length === 0) {
      showNotification('Debe agregar al menos un item', 'error');
      return;
    }

    const data = {
      ...editingItem,
      id: editingItem.id || `eg-${Date.now()}`,
      comprobante: editingItem.comprobante || `EGR-${format(new Date(), 'yyyyMMdd')}-${(egresos.length + 1).toString().padStart(3, '0')}`,
      usuario: currentUser.name,
      fechaCreacion: editingItem.fechaCreacion || new Date().toISOString()
    };

    // Calculate totals if not already correct
    const neto = data.items.reduce((sum: number, item: any) => sum + item.subtotal, 0);
    let iva = 0;
    if (data.tipoIva === 'IVA 21%') iva = neto * 0.21;
    else if (data.tipoIva === 'IVA 10,5%') iva = neto * 0.105;
    
    data.neto = neto;
    data.iva = iva;
    data.total = neto + iva;

    if (egresos.find((eg: any) => eg.id === data.id)) {
      setEgresos(egresos.map((eg: any) => eg.id === data.id ? data : eg));
      
      // If confirmed and impacts inventory, sync movements
      if (data.estado === 'Confirmado') {
        const tipo = tiposEgreso.find((t: any) => t.id === data.tipoEgresoId);
        if (tipo?.impactaInventario) {
          // Remove old movements for this egreso
          let updatedMovs = movimientos.filter((m: any) => m.referencia !== data.comprobante);
          
          // Generate new movements
          const newEntries: Movimiento[] = data.items
            .filter((it: any) => it.productoId && it.almacenDestinoId)
            .map((it: any) => {
              const prod = productos.find((p: any) => p.id === it.productoId);
              return {
                id: `mov-purchase-${Date.now()}-${it.id}`,
                tipo: 'entrada',
                productoId: it.productoId,
                almacenId: it.almacenDestinoId,
                cantidad: it.cantidad,
                unidad: prod?.unidadMedidaId === 'u1' ? 'kg' : 'un',
                cantidadKg: prod?.unidadMedidaId === 'u1' ? it.cantidad : (it.cantidad * (prod?.pesoNetoUnidad || 0)),
                motivo: `Compra - Egreso ${data.comprobante}`,
                loteNumero: it.loteProveedor || `COMP-${safeFormat(new Date(), 'yyyyMMdd')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
                fechaIngreso: data.fecha,
                fechaVencimiento: it.fechaVencimiento || '',
                origen: 'Compra',
                proveedor: proveedores.find((p: any) => p.id === data.proveedorId)?.razonSocial || 'Desconocido',
                usuario: currentUser.name,
                fechaHora: new Date().toISOString(),
                anulado: false,
                referencia: data.comprobante
              };
            });
          
          setMovimientos([...newEntries, ...updatedMovs]);
          showNotification(`Egreso confirmado. Mercadería ingresada al inventario.`, 'success');
        } else {
          showNotification('Egreso actualizado', 'success');
        }
      } else {
        showNotification('Egreso actualizado', 'success');
      }
    } else {
      setEgresos([...egresos, data]);
      
      // If confirmed and impacts inventory, generate movements
      if (data.estado === 'Confirmado') {
        const tipo = tiposEgreso.find((t: any) => t.id === data.tipoEgresoId);
        if (tipo?.impactaInventario) {
          const newEntries: Movimiento[] = data.items
            .filter((it: any) => it.productoId && it.almacenDestinoId)
            .map((it: any) => {
              const prod = productos.find((p: any) => p.id === it.productoId);
              return {
                id: `mov-purchase-${Date.now()}-${it.id}`,
                tipo: 'entrada',
                productoId: it.productoId,
                almacenId: it.almacenDestinoId,
                cantidad: it.cantidad,
                unidad: prod?.unidadMedidaId === 'u1' ? 'kg' : 'un',
                cantidadKg: prod?.unidadMedidaId === 'u1' ? it.cantidad : (it.cantidad * (prod?.pesoNetoUnidad || 0)),
                motivo: `Compra - Egreso ${data.comprobante}`,
                loteNumero: it.loteProveedor || `COMP-${safeFormat(new Date(), 'yyyyMMdd')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
                fechaIngreso: data.fecha,
                fechaVencimiento: it.fechaVencimiento || '',
                origen: 'Compra',
                proveedor: proveedores.find((p: any) => p.id === data.proveedorId)?.razonSocial || 'Desconocido',
                usuario: currentUser.name,
                fechaHora: new Date().toISOString(),
                anulado: false,
                referencia: data.comprobante
              };
            });
          
          setMovimientos([...newEntries, ...movimientos]);
          showNotification(`Egreso registrado. Mercadería ingresada al inventario.`, 'success');
        } else {
          showNotification('Egreso registrado', 'success');
        }
      } else {
        showNotification('Egreso registrado', 'success');
      }
    }
    setIsModalOpen(false);
  };

  const addItem = () => {
    const newItem = { 
      id: `ei-${Date.now()}`, 
      subtotal: 0, 
      almacenDestinoId: almacenes.find((a: any) => a.tipo === 'Materia Prima')?.id || almacenes[0]?.id || '' 
    };
    setEditingItem({ ...editingItem, items: [...(editingItem.items || []), newItem] });
  };

  const removeItem = (idx: number) => {
    const newItems = [...editingItem.items];
    newItems.splice(idx, 1);
    setEditingItem({ ...editingItem, items: newItems });
  };

  const updateItem = (idx: number, field: string, value: any) => {
    const newItems = [...editingItem.items];
    const item = { ...newItems[idx], [field]: value };
    
    if (field === 'cantidad' || field === 'precioUnitario' || field === 'monto') {
      const q = field === 'cantidad' ? value : (item.cantidad || 0);
      const p = field === 'precioUnitario' ? value : (item.precioUnitario || 0);
      const m = field === 'monto' ? value : (item.monto || 0);
      item.subtotal = q * p || m || 0;
    }
    
    if (field === 'productoId') {
      const prod = productos.find((p: any) => p.id === value);
      if (prod) {
        // Calculate expiry
        let venc = '';
        if (prod.vidaUtil?.valor) {
          const days = prod.vidaUtil.unidad === 'meses' ? prod.vidaUtil.valor * 30 : prod.vidaUtil.valor;
          venc = format(addDays(new Date(), days), 'yyyy-MM-dd');
        }
        item.fechaVencimiento = venc;
        // Try to preselect warehouse based on type if not set
        if (!item.almacenDestinoId) {
          const targetType = prod.tipo === 'Materia Prima' ? 'Cámara Materia Prima' : 'Depósito';
          item.almacenDestinoId = almacenes.find((a: any) => a.nombre.toLowerCase().includes(targetType.toLowerCase()))?.id || 
                                almacenes.find((a: any) => a.tipoAlmacenamiento.toLowerCase().includes(targetType.toLowerCase()))?.id ||
                                almacenes[0]?.id || '';
        }
      }
    }
    
    newItems[idx] = item;
    setEditingItem({ ...editingItem, items: newItems });
  };

  const totalConfirmado = egresos.filter((e: any) => e.estado === 'Confirmado').reduce((sum: number, e: any) => sum + e.total, 0);
  const totalPendientePago = egresos.filter((e: any) => e.estado === 'Confirmado' && e.estadoPago !== 'Pagado').reduce((sum: number, e: any) => sum + e.total, 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 text-slate-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-sleek-dark uppercase tracking-tighter">Egresos y Compras</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Gestión operativa de gastos y compras</p>
        </div>
        <button 
          onClick={() => { 
            setEditingItem({ 
              fecha: format(new Date(), 'yyyy-MM-dd'), 
              tipoEgresoId: tiposEgreso[0]?.id || '', 
              items: [], 
              tipoIva: 'Exento / No aplica',
              estado: 'Borrador',
              estadoPago: 'Pendiente'
            }); 
            setIsModalOpen(true); 
          }}
          className="bg-sleek-dark text-white px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-2xl hover:shadow-sleek-accent/20 hover:-translate-y-1 transition-all flex items-center gap-3 border border-white/10"
        >
          <Plus className="w-5 h-5 text-sleek-accent" /> Registrar Nuevo Egreso
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-white rounded-2xl shadow-xl border border-slate-100 flex flex-col items-center">
           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Egresos Mes</p>
           <p className="text-3xl font-black text-sleek-dark tracking-tighter">$ {totalConfirmado.toLocaleString('es-AR')}</p>
        </div>
        <div className="p-6 bg-white rounded-2xl shadow-xl border border-slate-100 flex flex-col items-center">
           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Pendiente de Pago</p>
           <p className="text-3xl font-black text-rose-500 tracking-tighter">$ {totalPendientePago.toLocaleString('es-AR')}</p>
        </div>
        <div className="p-6 bg-white rounded-2xl shadow-xl border border-slate-100 flex flex-col items-center">
           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Proveedores Activos</p>
           <p className="text-3xl font-black text-sleek-accent tracking-tighter">{proveedores.length}</p>
        </div>
      </div>

      <Card className="p-6 border-none shadow-xl bg-white/80 backdrop-blur-md">
        <div className="flex flex-col md:flex-row gap-4">
           <div className="relative flex-1">
             <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"><Search className="w-4 h-4" /></span>
             <input 
              type="text"
              placeholder="Buscar por comprobante o proveedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-11 pr-6 py-4 bg-slate-50 border border-slate-100 rounded-xl w-full text-xs font-bold focus:ring-2 focus:ring-sleek-accent outline-none transition-all"
             />
           </div>
           <select 
             value={filterType}
             onChange={(e) => setFilterType(e.target.value)}
             className="px-6 py-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-sleek-accent outline-none"
           >
             <option value="Todos">Todos los tipos</option>
             {tiposEgreso.map((t: any) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
           </select>
           <select 
             value={filterStatus}
             onChange={(e) => setFilterStatus(e.target.value)}
             className="px-6 py-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-sleek-accent outline-none"
           >
             <option value="Todos">Todos los estados</option>
             <option value="Confirmado">Confirmado</option>
             <option value="Borrador">Borrador</option>
             <option value="Anulado">Anulado</option>
           </select>
        </div>

        <div className="mt-8 overflow-x-auto">
           <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">
                  <th className="pb-4 px-2">Fecha</th>
                  <th className="pb-4 px-2">Comprobante</th>
                  <th className="pb-4 px-2">Proveedor</th>
                  <th className="pb-4 px-2">Estado</th>
                  <th className="pb-4 px-2 text-right">Total</th>
                  <th className="pb-4 px-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((eg: any) => (
                  <tr key={eg.id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="py-5 px-2">
                       <p className="text-[11px] font-bold text-slate-500">{format(parseISO(eg.fecha), 'dd/MM/yyyy')}</p>
                    </td>
                    <td className="py-5 px-2">
                       <p className="text-[11px] font-black text-sleek-dark uppercase">{eg.comprobante}</p>
                    </td>
                    <td className="py-5 px-2">
                       <p className="text-xs font-bold text-slate-600 uppercase">{eg.proveedorId ? proveedores.find((p: any) => p.id === eg.proveedorId)?.razonSocial : 'S/P'}</p>
                    </td>
                    <td className="py-5 px-2">
                       <div className="flex flex-col gap-1">
                          <Badge variant={eg.estado === 'Confirmado' ? 'success' : eg.estado === 'Anulado' ? 'danger' : 'warning'}>{eg.estado}</Badge>
                          {eg.estado === 'Confirmado' && (
                            <Badge variant={eg.estadoPago === 'Pagado' ? 'success' : 'warning'} className="text-[8px]">{eg.estadoPago}</Badge>
                          )}
                       </div>
                    </td>
                    <td className="py-5 px-2 text-right font-black text-sm text-sleek-dark">
                       $ {eg.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-5 px-2 text-right">
                       <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => { setEditingItem(eg); setIsModalOpen(true); }} className="p-2 hover:bg-sleek-accent/10 text-sleek-accent rounded transition-all"><Edit2 className="w-4 h-4" /></button>
                          {eg.estado === 'Borrador' && (
                            <button 
                              onClick={() => {
                                confirmDialog(`¿Eliminar el egreso ${eg.comprobante}? Esta acción no se puede deshacer.`, () => {
                                  setEgresos(egresos.filter((e: any) => e.id !== eg.id));
                                  showNotification(`Egreso ${eg.comprobante} eliminado.`, 'success');
                                });
                              }}
                              className="p-2 hover:bg-rose-50 text-rose-400 rounded transition-all"
                              title="Eliminar Borrador"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          {eg.estado === 'Confirmado' && (
                            <button 
                              onClick={() => {
                                confirmDialog(`¿Anular el egreso ${eg.comprobante} por $${displayNum(eg.total, 2)}? Se revertirá el stock ingresado y la deuda con el proveedor.`, () => {
                                  setEgresos(egresos.map((e: any) => e.id === eg.id ? { ...e, estado: 'Anulado' } : e));
                                  
                                  // Anular movimientos asociados
                                  const updatedMovs = movimientos.map((m: any) => 
                                    m.referencia === eg.comprobante ? { 
                                      ...m, 
                                      anulado: true, 
                                      anuladoPor: currentUser.name, 
                                      anuladoFecha: new Date().toISOString(),
                                      motivo: `ANULADO - ${m.motivo}`
                                    } : m
                                  );
                                  setMovimientos(updatedMovs);
                                  
                                  showNotification(`Egreso ${eg.comprobante} anulado. Stock y deuda revertidos.`, 'success');
                                });
                              }}
                              className="p-2 hover:bg-rose-50 text-rose-400 rounded transition-all"
                              title="Anular Egreso Confirmado"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
           </table>
        </div>
      </Card>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem?.id ? 'Detalle de Egreso' : 'Registrar Nuevo Egreso'} className="modal-egreso">
        <form onSubmit={handleSave} className="flex flex-col h-full space-y-8">
           {/* Header Info - Two Columns */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-8 border-b border-slate-100">
              {/* Column 1: Info General */}
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fecha</label>
                    <input 
                      type="date"
                      value={editingItem?.fecha || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, fecha: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg text-sm font-bold focus:ring-2 focus:ring-sleek-accent outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nro Comprobante Propio</label>
                    <input 
                      type="text"
                      disabled
                      value={editingItem?.comprobante || 'Autogenerado al guardar'}
                      className="w-full px-4 py-3 bg-slate-100 border border-slate-100 rounded-lg text-sm font-bold text-slate-400"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Proveedor / Beneficiario</label>
                  <select 
                    value={editingItem?.proveedorId || ''}
                    onChange={(e) => {
                      const prov = proveedores.find((p: any) => p.id === e.target.value);
                      const tipoId = prov?.tipoEgresoDefectoId || editingItem.tipoEgresoId;
                      const tipo = tiposEgreso.find((t: any) => t.id === tipoId);
                      const cuentaId = prov?.cuentaContableDefectoId || tipo?.cuentaContableDefectoId || editingItem.cuentaContableId;
                      
                      setEditingItem({ 
                        ...editingItem, 
                        proveedorId: e.target.value,
                        tipoEgresoId: tipoId,
                        cuentaContableId: cuentaId
                      });
                    }}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg text-sm font-bold focus:ring-2 focus:ring-sleek-accent outline-none"
                  >
                    <option value="">Ocasional / Sin proveedor</option>
                    {proveedores.map((p: any) => <option key={p.id} value={p.id}>{p.razonSocial}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Concepto General / Notas</label>
                  <textarea 
                    rows={2}
                    value={editingItem?.observaciones || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, observaciones: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg text-sm font-bold resize-none focus:ring-2 focus:ring-sleek-accent outline-none"
                    placeholder="Resumen del egreso o notas internas..."
                  />
                </div>
              </div>

              {/* Column 2: Clasificación y Fiscal */}
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tipo de Egreso *</label>
                    <select 
                      value={editingItem?.tipoEgresoId || ''}
                      onChange={(e) => {
                        const tipo = tiposEgreso.find((t: any) => t.id === e.target.value);
                        setEditingItem({ ...editingItem, tipoEgresoId: e.target.value, cuentaContableId: tipo?.cuentaContableDefectoId || editingItem.cuentaContableId });
                      }}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg text-sm font-bold focus:ring-2 focus:ring-sleek-accent outline-none"
                    >
                      <option value="">Seleccionar Tipo...</option>
                      {tiposEgreso.map((t: any) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cuenta Contable (Detalle)</label>
                    <select 
                      value={editingItem?.cuentaContableId || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, cuentaContableId: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg text-sm font-bold focus:ring-2 focus:ring-sleek-accent outline-none"
                    >
                      <option value="">Seleccionar Cuenta...</option>
                      {planCuentas.filter((pc: any) => pc.nivel === 3).map((pc: any) => (
                        <option key={pc.id} value={pc.id}>{pc.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nro Comprobante Proveedor</label>
                    <input 
                      type="text"
                      value={editingItem?.nroFacturaProveedor || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, nroFacturaProveedor: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg text-sm font-bold focus:ring-2 focus:ring-sleek-accent outline-none"
                      placeholder="Ej: 0001-00004567"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado del Egreso</label>
                    <select 
                      disabled={editingItem?.estado === 'Confirmado' || editingItem?.estado === 'Anulado'}
                      value={editingItem?.estado || 'Borrador'}
                      onChange={(e) => setEditingItem({ ...editingItem, estado: e.target.value })}
                      className={cn(
                        "w-full px-4 py-3 border border-slate-100 rounded-lg text-sm font-black uppercase tracking-widest focus:ring-2 focus:ring-sleek-accent outline-none",
                        editingItem?.estado === 'Confirmado' ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-600"
                      )}
                    >
                      <option value="Borrador">📝 Borrador</option>
                      <option value="Confirmado">✅ Confirmado</option>
                    </select>
                  </div>
                </div>
                
                <div className="p-4 bg-sleek-accent/5 rounded-xl border border-sleek-accent/10 flex items-center gap-3">
                   <Info className="w-5 h-5 text-sleek-accent" />
                   <p className="text-[10px] font-bold text-slate-500 uppercase leading-relaxed">
                      La configuración regional y contable se aplica jerárquicamente: <br/>
                      1. Preajustes del Proveedor → 2. Configuración del Tipo de Egreso.
                   </p>
                </div>
              </div>
           </div>

           {/* Items Section */}
           <div className="space-y-4">
              <div className="flex justify-between items-center">
                 <h3 className="text-xs font-black text-sleek-dark uppercase tracking-widest">Detalle de Compra / Conceptos</h3>
                 <button 
                  type="button"
                  onClick={addItem}
                  className="px-4 py-2 bg-sleek-accent/10 text-sleek-accent text-[10px] font-black uppercase rounded shadow-sm hover:bg-sleek-accent hover:text-white transition-all"
                 >
                  + Agregar Item
                 </button>
              </div>

              <div className="space-y-3 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
                 {editingItem?.items?.map((item: any, idx: number) => {
                   const isInventoryImpact = tiposEgreso.find((t: any) => t.id === editingItem.tipoEgresoId)?.impactaInventario;
                   
                   return (
                     <div key={item.id} className="grid grid-cols-12 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100 items-end">
                        {isInventoryImpact ? (
                          <>
                            <div className="col-span-12 md:col-span-3 space-y-1">
                               <label className="text-[8px] font-black text-slate-400 uppercase">Producto/Ingrediente</label>
                               <select 
                                 value={item.productoId || ''}
                                 onChange={(e) => updateItem(idx, 'productoId', e.target.value)}
                                 className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-xs font-bold"
                               >
                                 <option value="">Seleccionar...</option>
                                 {productos.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                               </select>
                            </div>
                            <div className="col-span-4 md:col-span-1 space-y-1">
                               <label className="text-[8px] font-black text-slate-400 uppercase">Cant.</label>
                               <input 
                                 type="number" step="0.01"
                                 value={item.cantidad || ''}
                                 onChange={(e) => updateItem(idx, 'cantidad', parseFloat(e.target.value) || 0)}
                                 className="w-full px-2 py-2 bg-white border border-slate-200 rounded text-xs font-bold"
                               />
                            </div>
                            <div className="col-span-4 md:col-span-1 space-y-1">
                               <label className="text-[8px] font-black text-slate-400 uppercase">Precio Un.</label>
                               <input 
                                 type="number" step="0.01"
                                 value={item.precioUnitario || ''}
                                 onChange={(e) => updateItem(idx, 'precioUnitario', parseFloat(e.target.value) || 0)}
                                 className="w-full px-2 py-2 bg-white border border-slate-200 rounded text-xs font-bold"
                               />
                            </div>
                            <div className="col-span-4 md:col-span-2 space-y-1">
                               <label className="text-[8px] font-black text-slate-400 uppercase">Lote Prov.</label>
                               <input 
                                 type="text"
                                 value={item.loteProveedor || ''}
                                 onChange={(e) => updateItem(idx, 'loteProveedor', e.target.value)}
                                 className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-[10px] font-bold"
                                 placeholder="Lote..."
                               />
                            </div>
                            <div className="col-span-6 md:col-span-2 space-y-1">
                               <label className="text-[8px] font-black text-slate-400 uppercase">Vencimiento</label>
                               <input 
                                 type="date"
                                 value={item.fechaVencimiento || ''}
                                 onChange={(e) => updateItem(idx, 'fechaVencimiento', e.target.value)}
                                 className="w-full px-2 py-2 bg-white border border-slate-200 rounded text-[10px] font-bold"
                               />
                            </div>
                            <div className="col-span-6 md:col-span-2 space-y-1">
                               <label className="text-[8px] font-black text-slate-400 uppercase">Almacén Destino</label>
                               <select 
                                 value={item.almacenDestinoId || ''}
                                 onChange={(e) => updateItem(idx, 'almacenDestinoId', e.target.value)}
                                 className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-[10px] font-bold"
                               >
                                 <option value="">Seleccionar...</option>
                                 {almacenes.map((a: any) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                               </select>
                            </div>
                            <div className="col-span-12 md:col-span-1 flex justify-end">
                               <button onClick={() => removeItem(idx)} type="button" className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="col-span-12 md:col-span-8 space-y-1">
                               <label className="text-[8px] font-black text-slate-400 uppercase">Concepto / Glosa</label>
                               <input 
                                 type="text" 
                                 value={item.concepto || ''}
                                 onChange={(e) => updateItem(idx, 'concepto', e.target.value)}
                                 className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-xs font-bold"
                                 placeholder="Ej: Pago servicio de limpieza..."
                               />
                            </div>
                            <div className="col-span-10 md:col-span-3 space-y-1">
                               <label className="text-[8px] font-black text-slate-400 uppercase">Monto Neto ($)</label>
                               <input 
                                 type="number" step="0.01"
                                 value={item.monto || ''}
                                 onChange={(e) => updateItem(idx, 'monto', parseFloat(e.target.value) || 0)}
                                 className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-xs font-bold"
                               />
                            </div>
                            <div className="col-span-2 md:col-span-1 flex justify-end">
                               <button onClick={() => removeItem(idx)} type="button" className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </>
                        )}
                     </div>
                   );
                 })}
                 {(!editingItem?.items || editingItem.items.length === 0) && (
                   <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl flex flex-col items-center justify-center text-slate-300 space-y-2">
                      <Plus className="w-8 h-8 opacity-20" />
                      <p className="text-[10px] font-black uppercase tracking-widest">No hay items cargados aún</p>
                   </div>
                 )}
              </div>
           </div>

           {/* Totals Section */}
           <div className="bg-slate-50 p-8 rounded-2xl border border-slate-100 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                 <div className="space-y-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tipo de IVA</label>
                       <select 
                        value={editingItem?.tipoIva || 'Exento / No aplica'}
                        onChange={(e) => setEditingItem({ ...editingItem, tipoIva: e.target.value })}
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                       >
                         <option value="Exento / No aplica">Exento / No aplica</option>
                         <option value="IVA 10,5%">IVA 10,5%</option>
                         <option value="IVA 21%">IVA 21%</option>
                         <option value="IVA incluido 21%">Netear (IVA incluido 21%)</option>
                       </select>
                    </div>
                 </div>
                 <div className="md:col-span-1 lg:col-span-3 flex flex-col items-end gap-3">
                    <div className="flex items-center gap-8">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subtotal Neto:</span>
                       <span className="text-xl font-bold text-slate-600">$ {editingItem?.items?.reduce((s: number, i: any) => s + (i.subtotal || 0), 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex items-center gap-8">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">IVA:</span>
                       <span className="text-xl font-bold text-slate-500">$ {(() => {
                         const neto = editingItem?.items?.reduce((s: number, i: any) => s + (i.subtotal || 0), 0);
                         if (editingItem?.tipoIva === 'IVA 21%') return (neto * 0.21).toLocaleString('es-AR', { minimumFractionDigits: 2 });
                         if (editingItem?.tipoIva === 'IVA 10,5%') return (neto * 0.105).toLocaleString('es-AR', { minimumFractionDigits: 2 });
                         return '0,00';
                       })()}</span>
                    </div>
                    <div className="h-px w-full max-w-[300px] bg-slate-200 my-2"></div>
                    <div className="flex items-center gap-8">
                       <span className="text-xs font-black text-sleek-dark uppercase tracking-widest">Total Egreso:</span>
                       <span className="text-4xl font-black text-sleek-dark tracking-tighter">$ {(() => {
                         const neto = editingItem?.items?.reduce((s: number, i: any) => s + (i.subtotal || 0), 0);
                         let iva = 0;
                         if (editingItem?.tipoIva === 'IVA 21%') iva = neto * 0.21;
                         else if (editingItem?.tipoIva === 'IVA 10,5%') iva = neto * 0.105;
                         return (neto + iva).toLocaleString('es-AR', { minimumFractionDigits: 2 });
                       })()}</span>
                    </div>
                 </div>
              </div>
           </div>

           <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Observaciones Generales</label>
              <textarea 
                rows={2}
                value={editingItem?.observaciones || ''}
                onChange={(e) => setEditingItem({ ...editingItem, observaciones: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold resize-none"
                placeholder="Notas internas relativas a este egreso..."
              />
           </div>

           <div className="flex gap-4 pt-4">
            <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-black rounded-xl uppercase tracking-widest text-[10px]">Cancelar</button>
            <button type="submit" className="flex-[2] py-4 bg-sleek-dark text-white font-black rounded-xl shadow-2xl uppercase tracking-widest text-[10px] flex items-center justify-center gap-3">
              <Save className="w-5 h-5" /> Guardar Registro
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const PuntosVentaView = ({ puntosVenta, setPuntosVenta, users, showNotification }: any) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPV, setEditingPV] = useState<any>(null);

  const handleCreateNew = () => {
    setEditingPV({
      id: `pv-${Date.now()}`,
      nombre: '',
      direccion: '',
      responsableId: users[0]?.id || '',
      estado: 'Activo'
    });
    setIsModalOpen(true);
  };

  const handleEdit = (pv: any) => {
    setEditingPV({ ...pv });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!editingPV.nombre) {
      showNotification('El nombre es obligatorio', 'error');
      return;
    }

    if (puntosVenta.find((p: any) => p.id === editingPV.id)) {
      setPuntosVenta(puntosVenta.map((p: any) => p.id === editingPV.id ? editingPV : p));
      showNotification('Punto de Venta actualizado', 'success');
    } else {
      setPuntosVenta([...puntosVenta, editingPV]);
      showNotification('Punto de Venta creado', 'success');
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-sleek-dark uppercase tracking-widest">Puntos de Venta</h1>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Gestión de locales, plantas y terminales de despacho</p>
        </div>
        <button 
          onClick={handleCreateNew}
          className="bg-sleek-dark hover:bg-slate-800 text-white px-8 py-3 rounded-lg font-black text-xs uppercase tracking-widest transition-all shadow-lg hover:shadow-2xl flex items-center gap-3"
        >
          <Plus className="w-5 h-5" /> Nuevo Punto de Venta
        </button>
      </div>

      <Card className="overflow-hidden border-none shadow-xl rounded-2xl bg-white/80 backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-5 text-left text-[10px] font-black uppercase text-slate-400 tracking-widest">Nombre</th>
                <th className="px-8 py-5 text-left text-[10px] font-black uppercase text-slate-400 tracking-widest">Dirección</th>
                <th className="px-8 py-5 text-left text-[10px] font-black uppercase text-slate-400 tracking-widest">Responsable</th>
                <th className="px-8 py-5 text-center text-[10px] font-black uppercase text-slate-400 tracking-widest">Estado</th>
                <th className="px-8 py-5 text-right text-[10px] font-black uppercase text-slate-400 tracking-widest">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {puntosVenta.map((pv: any) => {
                const resp = users.find((u: any) => u.id === pv.responsableId);
                return (
                  <tr key={pv.id} className="hover:bg-sleek-accent/5 transition-all group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:text-sleek-accent transition-all ring-1 ring-slate-100">
                          <MapPin className="w-5 h-5" />
                        </div>
                        <p className="text-[13px] font-black text-sleek-dark uppercase group-hover:text-sleek-accent transition-colors">{pv.nombre}</p>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">{pv.direccion || '-'}</p>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[9px] font-black text-slate-600">
                           {resp?.name.charAt(0) || '?'}
                        </div>
                        <p className="text-[11px] font-black text-slate-600 uppercase">{resp?.name || 'Desconocido'}</p>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <Badge variant={pv.estado === 'Activo' ? 'success' : 'default'}>{pv.estado}</Badge>
                    </td>
                    <td className="px-8 py-5 text-right">
                       <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                        <button 
                          onClick={() => handleEdit(pv)}
                          className="p-2.5 text-slate-400 hover:text-sleek-accent hover:bg-sleek-accent/10 rounded-lg transition-all"
                        >
                          <Edit2 className="w-4.5 h-4.5" />
                        </button>
                        <button 
                          onClick={() => {
                            const newStatus = pv.estado === 'Activo' ? 'Inactiva' : 'Activo';
                            setPuntosVenta(puntosVenta.map((p: any) => p.id === pv.id ? { ...p, estado: newStatus } : p));
                            showNotification(`Punto de venta ${newStatus === 'Activo' ? 'activado' : 'desactivado'}`, 'success');
                          }}
                          className={cn(
                            "p-2.5 rounded-lg transition-all",
                            pv.estado === 'Activo' ? "text-slate-400 hover:text-sleek-warning hover:bg-sleek-warning/10" : "text-slate-400 hover:text-sleek-success hover:bg-sleek-success/10"
                          )}
                        >
                          <XCircle className="w-4.5 h-4.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Gestionar Punto de Venta">
        {editingPV && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nombre del Punto *</label>
              <input 
                type="text" 
                value={editingPV.nombre}
                onChange={(e) => setEditingPV({ ...editingPV, nombre: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
                placeholder="Ej: Salón de Ventas Planta"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dirección física</label>
              <input 
                type="text" 
                value={editingPV.direccion}
                onChange={(e) => setEditingPV({ ...editingPV, direccion: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
                placeholder="Calle y Número..."
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Responsable / Encargado</label>
                <select 
                  value={editingPV.responsableId}
                  onChange={(e) => setEditingPV({ ...editingPV, responsableId: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
                >
                  {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado</label>
                <select 
                  value={editingPV.estado}
                  onChange={(e) => setEditingPV({ ...editingPV, estado: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-sleek-accent outline-none font-bold text-slate-700"
                >
                  <option value="Activo">Activo</option>
                  <option value="Inactiva">Inactiva</option>
                </select>
              </div>
            </div>

            <div className="flex gap-4 pt-6">
               <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black rounded-xl uppercase tracking-widest text-[10px]"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSave}
                className="flex-[2] py-4 bg-sleek-dark hover:bg-slate-800 text-white font-black rounded-xl shadow-xl uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" /> Guardar Punto de Venta
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

const InventarioDashboard = ({ 
  almacenes, 
  getOcupacionAlmacen, 
  getAlertasAlmacen, 
  setActiveSubSection, 
  setEditingItem, 
  movimientos, 
  productos, 
  lotesStock,
  getPesoEquivalente
}: any) => {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-sleek-dark uppercase tracking-widest">Dashboard de Almacenes</h1>
        <button className="bg-sleek-dark hover:bg-slate-800 text-white px-6 py-2 rounded font-bold text-xs uppercase tracking-widest transition-all">
          + Nuevo Almacén
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {almacenes.map((almacen: any) => {
          const ocupacion = getOcupacionAlmacen(almacen.id);
          const alertas = getAlertasAlmacen(almacen.id);
          const capacidad = almacen.capacidadMax || almacen.capacidadMaxKg || 0;
          return (
            <div key={almacen.id}>
              <Card className="p-6" onClick={() => {
                setActiveSubSection('Almacenes');
                setEditingItem(almacen);
              }}>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">{almacen.nombre}</span>
                <span className="text-xl font-bold text-sleek-dark block mb-6">{(capacidad || 0).toLocaleString()} kg Capacidad</span>
                
                <div className="mb-6">
                  <ProgressBar 
                    value={ocupacion} 
                    max={capacidad} 
                    label="Ocupación Total" 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3 rounded border-l-4 border-sleek-danger">
                    <span className="text-xl font-bold text-sleek-danger block">{alertas.stockBajo.toString().padStart(2, '0')}</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Stock Bajo</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded border-l-4 border-sleek-accent">
                    <span className="text-xl font-bold text-sleek-accent block">{alertas.proximosVencer.toString().padStart(2, '0')}</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Prox. Vencer</span>
                  </div>
                </div>
              </Card>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-6">
          <h3 className="text-sm font-bold text-sleek-dark uppercase tracking-widest mb-6 flex items-center gap-2">
            <History className="w-4 h-4 text-sleek-accent" />
            Últimos Movimientos
          </h3>
          <div className="space-y-4">
            {movimientos.slice(-5).reverse().map((mov: any) => {
              const prod = productos.find((p: any) => p.id === mov.productoId);
              return (
                <div key={mov.id} className="flex items-center justify-between p-4 bg-slate-50 rounded border border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "p-2 rounded",
                      mov.tipo === 'Entrada' ? "bg-sleek-success/10 text-sleek-success" : "bg-sleek-danger/10 text-sleek-danger"
                    )}>
                      {mov.tipo === 'Entrada' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-sleek-dark uppercase tracking-tight">{prod?.nombre}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">{mov.fecha ? safeFormat(mov.fecha, 'dd/MM/yyyy') : ''} • {mov.motivo}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "text-sm font-bold",
                      mov.tipo === 'Entrada' ? "text-sleek-success" : "text-sleek-danger"
                    )}>
                      {mov.tipo === 'Entrada' ? '+' : '-'}{mov.cantidad} {prod?.unidadMedida}
                      {prod?.unidadMedida !== 'kg' && (
                        <span className="text-[10px] text-slate-400 block font-normal leading-tight">
                          ({formatNum(mov.cantidad * getPesoEquivalente(mov.productoId), 2)} kg)
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold">LOTE: {mov.numeroLote}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-bold text-sleek-dark uppercase tracking-widest mb-6 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-sleek-danger" />
            Alertas Críticas
          </h3>
          <div className="space-y-4">
            {almacenes.some((a: any) => (getOcupacionAlmacen(a.id) / a.capacidadMaxKg) > 0.9) && (
              <div className="p-4 bg-sleek-danger/5 border-l-4 border-sleek-danger rounded flex items-center gap-4">
                <AlertTriangle className="w-5 h-5 text-sleek-danger" />
                <div>
                  <p className="text-xs text-sleek-danger font-bold uppercase tracking-wider">Capacidad Crítica</p>
                  <p className="text-[10px] text-slate-500 font-medium">Un almacén ha superado el 90% de ocupación.</p>
                </div>
              </div>
            )}
            {lotesStock.some((l: any) => safeIsBefore(l.fechaVencimiento, new Date())) && (
              <div className="p-4 bg-sleek-danger/5 border-l-4 border-sleek-danger rounded flex items-center gap-4">
                <XCircle className="w-5 h-5 text-sleek-danger" />
                <div>
                  <p className="text-xs text-sleek-danger font-bold uppercase tracking-wider">Lotes Vencidos</p>
                  <p className="text-[10px] text-slate-500 font-medium">Se detectaron productos con fecha de vencimiento expirada.</p>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

const getGreeting = () => {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Buen día';
  if (h >= 12 && h < 19) return 'Buenas tardes';
  return 'Buenas noches';
};

const formatRelativeTime = (fechaHora: string) => {
  const then = parseISO(fechaHora);
  if (!isValid(then)) return '';
  const diffMin = Math.floor((Date.now() - then.getTime()) / 60000);
  if (diffMin < 60) return `Hace ${Math.max(1, diffMin)} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Hace ${diffHours} horas`;
  return `Hace ${Math.floor(diffHours / 24)} días`;
};

const SidebarHomeItem = ({ activeModule, setActiveModule, setActiveSubSection, setExpandedModule, sidebarExpanded }: any) => {
  const isActive = activeModule === 'INICIO';
  return (
    <button
      type="button"
      onClick={() => {
        setActiveModule('INICIO');
        setActiveSubSection('Inicio');
        setExpandedModule(null);
      }}
      className={cn(
        "w-full flex items-center gap-3 px-6 py-4 transition-all duration-200 border-l-4 mb-0",
        isActive ? "bg-white/5 text-white border-sleek-accent" : "text-white/60 border-transparent hover:bg-white/5 hover:text-white"
      )}
    >
      <Home className="w-4 h-4 shrink-0" />
      {sidebarExpanded && <span className="font-bold text-xs uppercase tracking-widest">INICIO</span>}
    </button>
  );
};

const InicioView = ({
  currentUser,
  productos,
  lotesProduccion,
  lotesDespiece,
  movimientos,
  almacenes,
  unidades,
  lotesStock,
  stockSeguridad,
  setActiveModule,
  setActiveSubSection,
  setExpandedModule,
}: any) => {
  const config = getInicioConfig(currentUser);
  const today = format(new Date(), 'yyyy-MM-dd');

  const misLotes = useMemo(() => {
    const items: { id: string; numero: string; estado: string; descripcion: string; tipo: 'produccion' | 'despiece' }[] = [];

    lotesProduccion.forEach((l: LoteProduccion) => {
      const finalizadoHoy = l.estado === 'Finalizado' && (
        (l.fechaFinalizacion && l.fechaFinalizacion.startsWith(today)) || l.fechaElaboracion === today
      );
      if (['En Proceso', 'Planificado'].includes(l.estado) || finalizadoHoy) {
        const prod = productos.find((p: Producto) => p.id === l.productoTerminadoId);
        const unidad = unidades.find((u: UnidadMedida) => u.id === prod?.unidadMedidaId);
        items.push({
          id: l.id,
          numero: l.numeroLote,
          estado: l.estado,
          descripcion: `${prod?.nombre || 'Producto'} · ${l.cantidadEstimada} ${unidad?.abreviatura || ''}`.trim(),
          tipo: 'produccion',
        });
      }
    });

    lotesDespiece.forEach((l: any) => {
      const estado = (getLoteField(l, 'estado') || l.estado) as string;
      const fechaElab = getLoteField(l, 'fecha') || l.fechaElaboracion;
      const fechaFin = l.fechaFinalizacion;
      const finalizadoHoy = estado === 'Finalizado' && (
        (fechaFin && String(fechaFin).startsWith(today)) || fechaElab === today
      );
      if (['En Proceso', 'Planificado'].includes(estado) || finalizadoHoy) {
        const mpId = getLoteField(l, 'materia_prima') || l.materiaPrimaId;
        const prod = productos.find((p: Producto) => p.id === mpId);
        const cantidad = getLoteField(l, 'cantidad') ?? l.cantidadIngresada;
        const unidad = unidades.find((u: UnidadMedida) => u.id === prod?.unidadMedidaId);
        items.push({
          id: l.id,
          numero: getLoteField(l, 'numeroLote') || l.numeroLote,
          estado,
          descripcion: `${prod?.nombre || 'Materia prima'} · ${cantidad} ${unidad?.abreviatura || ''}`.trim(),
          tipo: 'despiece',
        });
      }
    });

    return items;
  }, [lotesProduccion, lotesDespiece, productos, unidades, today]);

  const stockCritico = useMemo(() => {
    const byProduct = new Map<string, { productoId: string; actual: number; seguridad: number; deficit: number }>();
    stockSeguridad.forEach((ss: StockSeguridad) => {
      if (ss.cantidad <= 0) return;
      const actual = lotesStock
        .filter((l: LoteStock) => l.productoId === ss.productoId && l.almacenId === ss.almacenId)
        .reduce((sum: number, l: LoteStock) => sum + l.cantidad, 0);
      if (actual >= ss.cantidad) return;
      const prev = byProduct.get(ss.productoId);
      const deficit = ss.cantidad - actual;
      if (!prev || deficit > prev.deficit) {
        const totalActual = lotesStock
          .filter((l: LoteStock) => l.productoId === ss.productoId)
          .reduce((sum: number, l: LoteStock) => sum + l.cantidad, 0);
        byProduct.set(ss.productoId, { productoId: ss.productoId, actual: totalActual, seguridad: ss.cantidad, deficit });
      }
    });
    return Array.from(byProduct.values())
      .sort((a, b) => b.deficit - a.deficit)
      .slice(0, 5);
  }, [stockSeguridad, lotesStock]);

  const proximosVencer = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return lotesStock
      .map((l: LoteStock) => {
        const venc = parseISO(l.fechaVencimiento);
        if (!isValid(venc)) return null;
        const dias = safeDiffDays(venc, hoy);
        if (dias < 0 || dias > 5) return null;
        const prod = productos.find((p: Producto) => p.id === l.productoId);
        return { lote: l, productoNombre: prod?.nombre || 'Producto', dias };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.dias - b.dias)
      .slice(0, 5);
  }, [lotesStock, productos]);

  const actividadReciente = useMemo(() => {
    return [...movimientos]
      .filter((m: Movimiento) => !m.anulado)
      .sort((a: Movimiento, b: Movimiento) => b.fechaHora.localeCompare(a.fechaHora))
      .slice(0, 8);
  }, [movimientos]);

  const navigateToLote = (item: { tipo: 'produccion' | 'despiece' }) => {
    setActiveModule('PRODUCCIÓN');
    setExpandedModule('PRODUCCIÓN');
    setActiveSubSection(item.tipo === 'produccion' ? 'Lotes de Producción' : 'Lotes de Despiece');
  };

  const loteBorderClass = (estado: string) => {
    if (estado === 'En Proceso') return 'border-l-orange-500';
    if (estado === 'Finalizado') return 'border-l-emerald-500';
    if (estado === 'Planificado') return 'border-l-sky-500';
    return 'border-l-slate-300';
  };

  const loteBadgeVariant = (estado: string): 'default' | 'success' | 'warning' | 'danger' | 'info' => {
    if (estado === 'En Proceso') return 'warning';
    if (estado === 'Finalizado') return 'success';
    if (estado === 'Planificado') return 'info';
    return 'default';
  };

  const diasLabel = (dias: number) => {
    if (dias === 0) return 'Hoy';
    if (dias === 1) return '1 día';
    return `${dias} días`;
  };

  const hasAnyBlock = config.misLotes || config.stockCritico || config.proximosVencer || config.actividadReciente;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-sleek-dark text-white rounded-2xl px-8 py-10 shadow-xl border border-white/10">
        <h1 className="text-2xl md:text-3xl font-black tracking-tight">
          {getGreeting()}, {currentUser?.name?.split(' ')[0] || currentUser?.name}
        </h1>
        <p className="text-sm text-white/60 mt-2 font-bold uppercase tracking-widest">
          {(() => {
            const s = format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: es });
            return s.charAt(0).toUpperCase() + s.slice(1);
          })()}
        </p>
      </div>

      {!hasAnyBlock && (
        <Card className="p-10 text-center">
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No hay bloques habilitados en tu pantalla de inicio</p>
        </Card>
      )}

      {config.misLotes && (
        <Card className="p-6 border border-slate-100 rounded-2xl">
          <div className="flex items-center gap-2 mb-5">
            <Flame className="w-5 h-5 text-orange-500" />
            <h2 className="text-sm font-black text-sleek-dark uppercase tracking-widest">Mis lotes del día</h2>
          </div>
          {misLotes.length === 0 ? (
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No hay lotes activos ni finalizados hoy</p>
          ) : (
            <div className="space-y-3">
              {misLotes.map((lote) => (
                <button
                  key={`${lote.tipo}-${lote.id}`}
                  type="button"
                  onClick={() => navigateToLote(lote)}
                  className={cn(
                    "w-full text-left p-4 rounded-xl border border-slate-100 border-l-4 bg-slate-50/80 hover:bg-slate-50 transition-all",
                    loteBorderClass(lote.estado)
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-black text-sleek-dark uppercase">{lote.numero}</p>
                      <p className="text-xs font-bold text-slate-500 mt-1">{lote.descripcion}</p>
                    </div>
                    <Badge variant={loteBadgeVariant(lote.estado)}>{lote.estado}</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {(config.stockCritico || config.proximosVencer) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {config.stockCritico && (
            <Card className="p-6 border border-slate-100 rounded-2xl">
              <h2 className="text-sm font-black text-sleek-dark uppercase tracking-widest mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-sleek-danger" />
                Stock crítico
              </h2>
              {stockCritico.length === 0 ? (
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sin alertas de stock</p>
              ) : (
                <div className="space-y-2">
                  {stockCritico.map((item) => {
                    const prod = productos.find((p: Producto) => p.id === item.productoId);
                    const critico = item.actual <= 0;
                    return (
                      <div
                        key={item.productoId}
                        className={cn(
                          "p-3 rounded-xl text-xs font-bold",
                          critico ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"
                        )}
                      >
                        <p className="uppercase tracking-wide">{prod?.nombre || 'Producto'}</p>
                        <p className="mt-1 opacity-80">Stock actual: {item.actual.toLocaleString('es-AR')}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          {config.proximosVencer && (
            <Card className="p-6 border border-slate-100 rounded-2xl">
              <h2 className="text-sm font-black text-sleek-dark uppercase tracking-widest mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-sleek-warning" />
                Próximos a vencer
              </h2>
              {proximosVencer.length === 0 ? (
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sin vencimientos próximos</p>
              ) : (
                <div className="space-y-2">
                  {proximosVencer.map((item: any) => (
                    <div
                      key={item.lote.id}
                      className={cn(
                        "p-3 rounded-xl text-xs font-bold",
                        item.dias === 0 ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"
                      )}
                    >
                      <p className="uppercase tracking-wide">{item.productoNombre}</p>
                      <p className="mt-1 opacity-80">{diasLabel(item.dias)}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {config.actividadReciente && (
        <Card className="p-6 border border-slate-100 rounded-2xl">
          <h2 className="text-sm font-black text-sleek-dark uppercase tracking-widest mb-4 flex items-center gap-2">
            <History className="w-4 h-4 text-sleek-accent" />
            Actividad reciente
          </h2>
          {actividadReciente.length === 0 ? (
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sin movimientos recientes</p>
          ) : (
            <ul className="space-y-3">
              {actividadReciente.map((m: Movimiento) => {
                const prod = productos.find((p: Producto) => p.id === m.productoId);
                const alm = almacenes.find((a: Almacen) => a.id === m.almacenId);
                const dotClass =
                  m.tipo === 'entrada' ? 'bg-emerald-500' :
                  m.tipo === 'salida' ? 'bg-rose-500' : 'bg-sky-500';
                const tipoLabel = m.tipo.charAt(0).toUpperCase() + m.tipo.slice(1);
                return (
                  <li key={m.id} className="flex gap-3 items-start text-[11px]">
                    <span className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", dotClass)} />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sleek-dark leading-snug">
                        {tipoLabel} · {prod?.nombre || 'Producto'} · {m.cantidad} {m.unidad} · {alm?.nombre || 'Almacén'}
                      </p>
                      <p className="text-slate-400 font-bold mt-0.5">
                        {m.usuario} · {formatRelativeTime(m.fechaHora)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
};

const SidebarItem = ({ icon: Icon, label, module, activeModule, activeSubSection, expandedModule, setExpandedModule, setActiveModule, setActiveSubSection, subItems, sidebarExpanded, currentUser }: any) => {
  const filteredSubItems = subItems.filter((sub: string) => hasPermission(currentUser, module, sub));
  
  // Si no tiene permisos para NINGUNA subsección de este módulo, no mostrar el módulo en absoluto
  if (filteredSubItems.length === 0) return null;

  const isExpanded = expandedModule === module;
  const isActive = activeModule === module;

  return (
    <div className="mb-0">
      <button 
        onClick={() => {
          setExpandedModule(isExpanded ? null : module);
          setActiveModule(module);
          // Auto-select first available sub-section if we are expanding this and it's active
          if (!isExpanded && !hasPermission(currentUser, module, activeSubSection)) {
             setActiveSubSection(filteredSubItems[0]);
          }
        }}
        className={cn(
          "w-full flex items-center justify-between px-6 py-4 transition-all duration-200 border-l-4",
          isActive ? "bg-white/5 text-white border-sleek-accent" : "text-white/60 border-transparent hover:bg-white/5 hover:text-white"
        )}
      >
        <div className="flex items-center gap-3">
          <Icon className="w-4 h-4" />
          {sidebarExpanded && <span className="font-bold text-xs uppercase tracking-widest">{label}</span>}
        </div>
        {sidebarExpanded && (isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
      </button>
      
      {isExpanded && sidebarExpanded && (
        <div className="bg-black/20">
          {filteredSubItems.map((sub: string) => (
            <button
              key={sub}
              onClick={() => setActiveSubSection(sub)}
              className={cn(
                "w-full text-left px-12 py-3 text-[13px] transition-colors",
                activeSubSection === sub ? "text-white bg-sleek-accent" : "text-white/50 hover:text-white hover:bg-white/5"
              )}
            >
              {sub}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Main Application ---

export default function App() {
  const [confirmModal, setConfirmModal] = useState<{msg: string, onConfirm: () => void} | null>(null);

  useEffect(() => {
    globalConfirmAction = (msg, onConfirm) => {
      setConfirmModal({ msg, onConfirm });
    };
  }, []);

  // --- State ---
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('alido_logged_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [activeModule, setActiveModule] = useState<'INICIO' | 'INVENTARIO' | 'PRODUCCIÓN' | 'VENTAS' | 'EGRESOS' | 'USUARIOS'>('INICIO');
  const [activeSubSection, setActiveSubSection] = useState<string>('Inicio');
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  // Verify permissions on login / initialization
  useEffect(() => {
    if (activeModule === 'INICIO') return;
    if (currentUser && !hasPermission(currentUser, activeModule, activeSubSection)) {
      const ms = ['INVENTARIO', 'PRODUCCIÓN', 'VENTAS', 'EGRESOS', 'USUARIOS'];
      const defaultSub = {
        'INVENTARIO': ['Dashboard', 'Almacenes', 'Productos', 'Movimientos', 'Alertas', 'Reportes'],
        'PRODUCCIÓN': ['Lotes de Producción', 'Lotes de Despiece', 'Recetas Estándar', 'Plantillas de Despiece', 'Etiquetas', 'Dashboard', 'Trazabilidad'],
        'VENTAS': ['Ventas y Pedidos', 'Clientes', 'Listas de Precios', 'Puntos de Venta'],
        'EGRESOS': ['Egresos y Compras', 'Proveedores', 'Tipos de Egreso', 'Plan de Cuentas'],
        'USUARIOS': ['Gestión de Usuarios']
      };

      for (const m of ms) {
         if (hasAnyPermissionInModule(currentUser, m)) {
            setActiveModule(m as any);
            setExpandedModule(m);
            const subs = defaultSub[m as keyof typeof defaultSub];
            for (const s of subs) {
               if (hasPermission(currentUser, m, s)) {
                  setActiveSubSection(s);
                  return;
               }
            }
         }
      }
    }
  }, [currentUser, activeModule, activeSubSection]);

  // Data State — initialize with defaults, Supabase loads on mount
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [almacenes, setAlmacenes] = useState<Almacen[]>(INITIAL_ALMACENES);
  const [familias, setFamilias] = useState<Familia[]>(INITIAL_FAMILIAS);
  const [subfamilias, setSubfamilias] = useState<Subfamilia[]>(INITIAL_SUBFAMILIAS);
  const [unidades, setUnidades] = useState<UnidadMedida[]>(INITIAL_UNIDADES);
  const [productos, setProductos] = useState<Producto[]>(INITIAL_PRODUCTOS);
  const [stockSeguridad, setStockSeguridad] = useState<StockSeguridad[]>(INITIAL_STOCK_SEGURIDAD);
  const [movimientos, setMovimientos] = useState<Movimiento[]>(INITIAL_MOVIMIENTOS);
  const [recetas, setRecetas] = useState<Receta[]>(INITIAL_RECETAS);

  const [recetasHistorial, setRecetasHistorial] = useState<RecetaHistorial[]>(INITIAL_RECETAS_HISTORIAL);
  const [lotesProduccion, setLotesProduccion] = useState<LoteProduccion[]>(INITIAL_LOTES_PRODUCCION);
  const [lotesHistorial, setLotesHistorial] = useState<LoteProduccionHistorial[]>(INITIAL_LOTES_HISTORIAL);
  const [plantillasDespiece, setPlantillasDespiece] = useState<PlantillaDespiece[]>(INITIAL_PLANTILLAS_DESPIECE);
  const [plantillasDespieceHistorial, setPlantillasDespieceHistorial] = useState<PlantillaDespieceHistorial[]>(INITIAL_PLANTILLAS_DESPIECE_HISTORIAL);
  const [lotesDespiece, setLotesDespiece] = useState<LoteDespiece[]>(INITIAL_LOTES_DESPIECE);
  const [lotesDespieceHistorial, setLotesDespieceHistorial] = useState<LoteDespieceHistorial[]>(INITIAL_LOTES_DESPIECE_HISTORIAL);
  const [lotesEtiquetados, setLotesEtiquetados] = useState<any[]>([]);
  const [descuentosPendientes, setDescuentosPendientes] = useState<any[]>([]);

  // Ventas State
  const [clientes, setClientes] = useState<Cliente[]>(INITIAL_CLIENTES);
  const [listasPrecios, setListasPrecios] = useState<ListaPrecio[]>(INITIAL_LISTAS_PRECIOS);
  const [puntosVenta, setPuntosVenta] = useState<PuntoVenta[]>(INITIAL_PUNTOS_VENTA);
  const [ventas, setVentas] = useState<Venta[]>(INITIAL_VENTAS);
  const [cobrosClientes, setCobrosClientes] = useState<any[]>([]);

  // Egresos State
  const [planCuentas, setPlanCuentas] = useState<PlanCuenta[]>(INITIAL_PLAN_CUENTAS);
  const [tiposEgreso, setTiposEgreso] = useState<TipoEgreso[]>(INITIAL_TIPOS_EGRESO);
  const [proveedores, setProveedores] = useState<Proveedor[]>(INITIAL_PROVEEDORES);
  const [egresos, setEgresos] = useState<Egreso[]>(INITIAL_EGRESOS);
  const [pagosProveedores, setPagosProveedores] = useState<PagoProveedor[]>(INITIAL_PAGOS_PROVEEDORES);
  const [plantillasEgresos, setPlantillasEgresos] = useState<PlantillaEgreso[]>(INITIAL_PLANTILLAS_EGRESOS);
  const [mercaderiaPendiente, setMercaderiaPendiente] = useState<MercaderiaPendiente[]>(INITIAL_MERCADERIA_PENDIENTE);

  // --- Cargar datos desde Supabase al iniciar ---
  useEffect(() => {
    const DATA_KEYS = [
      'alido_users', 'alido_almacenes', 'alido_familias', 'alido_subfamilias',
      'alido_unidades_medida', 'alido_productos', 'alido_stock_seguridad',
      'alido_movimientos', 'alido_recetas', 'alido_recetas_historial',
      'alido_lotes_produccion', 'alido_lotes_historial', 'alido_plantillas_despiece',
      'alido_plantillas_despiece_historial', 'alido_lotes_despiece',
      'alido_lotes_despiece_historial', 'alido_lotes_etiquetados',
      'alido_descuentos_pendientes', 'alido_clientes', 'alido_listas_precios',
      'alido_puntos_venta', 'alido_ventas', 'alido_cobros_clientes',
      'alido_plan_cuentas', 'alido_tipos_egreso', 'alido_proveedores',
      'alido_egresos', 'alido_pagos_proveedores', 'alido_plantillas_egresos',
      'alido_mercaderia_pendiente'
    ];
    const INITIALS: Record<string, any> = {
      alido_users: INITIAL_USERS, alido_almacenes: INITIAL_ALMACENES,
      alido_familias: INITIAL_FAMILIAS, alido_subfamilias: INITIAL_SUBFAMILIAS,
      alido_unidades_medida: INITIAL_UNIDADES, alido_productos: INITIAL_PRODUCTOS,
      alido_stock_seguridad: INITIAL_STOCK_SEGURIDAD, alido_movimientos: INITIAL_MOVIMIENTOS,
      alido_recetas: INITIAL_RECETAS, alido_recetas_historial: INITIAL_RECETAS_HISTORIAL,
      alido_lotes_produccion: INITIAL_LOTES_PRODUCCION, alido_lotes_historial: [],
      alido_plantillas_despiece: INITIAL_PLANTILLAS_DESPIECE,
      alido_plantillas_despiece_historial: [], alido_lotes_despiece: INITIAL_LOTES_DESPIECE,
      alido_lotes_despiece_historial: [], alido_lotes_etiquetados: [],
      alido_descuentos_pendientes: [], alido_clientes: INITIAL_CLIENTES,
      alido_listas_precios: INITIAL_LISTAS_PRECIOS, alido_puntos_venta: INITIAL_PUNTOS_VENTA,
      alido_ventas: INITIAL_VENTAS, alido_cobros_clientes: [],
      alido_plan_cuentas: INITIAL_PLAN_CUENTAS, alido_tipos_egreso: INITIAL_TIPOS_EGRESO,
      alido_proveedores: INITIAL_PROVEEDORES, alido_egresos: INITIAL_EGRESOS,
      alido_pagos_proveedores: [], alido_plantillas_egresos: [],
      alido_mercaderia_pendiente: []
    };

    loadAllData(DATA_KEYS, INITIALS).then((d) => {
      setUsers(d.alido_users?.length ? d.alido_users : INITIAL_USERS);
      setAlmacenes(d.alido_almacenes);
      setFamilias(d.alido_familias);
      setSubfamilias(d.alido_subfamilias);
      setUnidades(d.alido_unidades_medida);
      setProductos(d.alido_productos);
      setStockSeguridad(d.alido_stock_seguridad);
      setMovimientos(d.alido_movimientos);
      setRecetas(d.alido_recetas);
      setRecetasHistorial(d.alido_recetas_historial);
      setLotesProduccion(d.alido_lotes_produccion);
      setLotesHistorial(d.alido_lotes_historial);
      setPlantillasDespiece(d.alido_plantillas_despiece);
      setPlantillasDespieceHistorial(d.alido_plantillas_despiece_historial);
      setLotesDespiece(d.alido_lotes_despiece);
      setLotesDespieceHistorial(d.alido_lotes_despiece_historial);
      setLotesEtiquetados(d.alido_lotes_etiquetados);
      setDescuentosPendientes(d.alido_descuentos_pendientes);
      setClientes(d.alido_clientes);
      setListasPrecios(d.alido_listas_precios);
      setPuntosVenta(d.alido_puntos_venta);
      setVentas(d.alido_ventas);
      setCobrosClientes(d.alido_cobros_clientes);
      setPlanCuentas(d.alido_plan_cuentas);
      setTiposEgreso(d.alido_tipos_egreso);
      setProveedores(d.alido_proveedores);
      setEgresos(d.alido_egresos);
      setPagosProveedores(d.alido_pagos_proveedores);
      setPlantillasEgresos(d.alido_plantillas_egresos);
      setMercaderiaPendiente(d.alido_mercaderia_pendiente);
      setIsLoading(false);
    });
  }, []);

  // Derived state for inventory compatibility
  const lotesStock = useMemo(() => {
    const stockMap: Record<string, LoteStock> = {};
    
    // Filtro robusto para excluir movimientos anulados de cualquier forma
    const validMovs = movimientos.filter(m => {
      if (!m) return false;
      if (m.anulado === true) return false;
      if (m.anulado === 'true') return false;
      if (m.estado === 'anulado') return false;
      return true;
    });

    validMovs.forEach(m => {
      const prod = productos.find(p => p.id === m.productoId);
      if (!prod) return;

      const key = `${m.productoId}-${m.almacenId}-${m.loteNumero}`;
      if (!stockMap[key]) {
        stockMap[key] = {
          id: `ls-${m.productoId}-${m.almacenId}-${m.loteNumero}`,
          productoId: m.productoId,
          almacenId: m.almacenId,
          numeroLote: m.loteNumero,
          cantidad: 0,
          fechaIngreso: m.fechaIngreso,
          fechaVencimiento: m.fechaVencimiento,
          pesoEquivalenteReal: m.cantidad !== 0 ? m.cantidadKg / m.cantidad : 1
        };
      }

      if (m.tipo === 'entrada') stockMap[key].cantidad += m.cantidad;
      else if (m.tipo === 'salida') stockMap[key].cantidad -= m.cantidad;
      else if (m.tipo === 'transferencia') {
        stockMap[key].cantidad -= m.cantidad;
        if (m.almacenDestinoId) {
          const destKey = `${m.productoId}-${m.almacenDestinoId}-${m.loteNumero}`;
          if (!stockMap[destKey]) {
            stockMap[destKey] = {
              id: `ls-${m.productoId}-${m.almacenDestinoId}-${m.loteNumero}`,
              productoId: m.productoId,
              almacenId: m.almacenDestinoId,
              numeroLote: m.loteNumero,
              cantidad: 0,
              fechaIngreso: m.fechaIngreso,
              fechaVencimiento: m.fechaVencimiento,
              pesoEquivalenteReal: m.cantidad !== 0 ? m.cantidadKg / m.cantidad : 1
            };
          }
          stockMap[destKey].cantidad += m.cantidad;
        }
      }
    });

    const result = Object.values(stockMap).filter(l => l.cantidad > 0.0001 || l.cantidad < -0.0001);

    // CRITICAL FIX: Override movements with physical container stock if labeling data exists
    return result.map(l => {
      const prod = productos.find(p => p.id === l.productoId);
      if (!prod) return l;

      const targetLoteNum = l.numeroLote;
      const internalProdLote = (lotesProduccion || []).find((lp: any) => lp.numeroLote === targetLoteNum);
      const internalDespieceLote = (lotesDespiece || []).find((ld: any) => ld.numeroLote === targetLoteNum);
      const internalId = internalProdLote?.id || internalDespieceLote?.id;

      const le = (lotesEtiquetados || []).find((item: any) => {
        const matchesNumero = item.loteNumero === targetLoteNum;
        const matchesId = item.loteId === targetLoteNum;
        const matchesInternalId = internalId && (item.loteId === internalId || item.parentLoteId === internalId);
        const matchesRawId = item.loteId === l.id;
        // Specialized butchery matching: must match BOTH lote AND product
        const butcheryPartMatch = internalId && item.loteId === `${internalId}-${l.productoId}`;

        // For non-butchery matches, also verify productoId if available
        const productMatch = !item.productoId || item.productoId === l.productoId;

        return butcheryPartMatch || ((matchesNumero || matchesId || matchesInternalId || matchesRawId) && productMatch);
      });

      if (le && le.envases && le.envases.length > 0) {
        const activeEnvases = le.envases.filter((e: any) => {
          const isAnulado = e.anulado === true || e.anulado === 'true';
          return (e.estado === 'en_stock' || !e.estado) && !isAnulado;
        });
        const totalWeight = activeEnvases.reduce((s: number, e: any) => s + e.pesoNeto, 0);
        const correctedQty = prod.unidadMedidaId === 'u1' ? totalWeight : activeEnvases.length;
        const correctedFactor = activeEnvases.length > 0 ? (correctedQty > 0 ? totalWeight / correctedQty : 1) : 1;
        return { ...l, cantidad: correctedQty, pesoEquivalenteReal: correctedFactor };
      }
      
      return l;
    });
  }, [movimientos, productos, lotesEtiquetados, lotesProduccion, lotesDespiece]);

  // UI State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<string>('');
  const [editingItem, setEditingItem] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  // --- Persistence: Save to Supabase (debounced) ---
  const saveTimerRef = useRef<any>(null);
  const dataLoadedRef = useRef(false);
  const isApplyingRemoteRef = useRef(false);
  const lastSyncRef = useRef(new Date().toISOString());

  useEffect(() => {
    if (isLoading) return; // Don't save while loading from Supabase
    if (isApplyingRemoteRef.current) return; // Don't save when applying remote changes
    if (!dataLoadedRef.current) {
      dataLoadedRef.current = true;
      return; // Skip first render after loading
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const dataMap: Record<string, any> = {
        alido_users: users, alido_almacenes: almacenes, alido_familias: familias,
        alido_subfamilias: subfamilias, alido_unidades_medida: unidades,
        alido_productos: productos, alido_stock_seguridad: stockSeguridad,
        alido_movimientos: movimientos, alido_recetas: recetas,
        alido_recetas_historial: recetasHistorial, alido_lotes_produccion: lotesProduccion,
        alido_lotes_historial: lotesHistorial, alido_plantillas_despiece: plantillasDespiece,
        alido_plantillas_despiece_historial: plantillasDespieceHistorial,
        alido_lotes_despiece: lotesDespiece, alido_lotes_despiece_historial: lotesDespieceHistorial,
        alido_lotes_etiquetados: lotesEtiquetados, alido_descuentos_pendientes: descuentosPendientes,
        alido_clientes: clientes, alido_listas_precios: listasPrecios,
        alido_puntos_venta: puntosVenta, alido_ventas: ventas,
        alido_cobros_clientes: cobrosClientes, alido_plan_cuentas: planCuentas,
        alido_tipos_egreso: tiposEgreso, alido_proveedores: proveedores,
        alido_egresos: egresos, alido_pagos_proveedores: pagosProveedores,
        alido_plantillas_egresos: plantillasEgresos, alido_mercaderia_pendiente: mercaderiaPendiente
      };
      // Save to Supabase
      lastSyncRef.current = new Date().toISOString();
      Object.entries(dataMap).forEach(([key, value]) => {
        saveToSupabase(key, value);
      });
      // Also keep localStorage as offline cache
      Object.entries(dataMap).forEach(([key, value]) => {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
      });
    }, 800); // Debounce 800ms to batch rapid changes
  }, [users, almacenes, familias, subfamilias, unidades, productos, stockSeguridad, movimientos, recetas, recetasHistorial, lotesProduccion, lotesHistorial, plantillasDespiece, plantillasDespieceHistorial, lotesDespiece, lotesDespieceHistorial, lotesEtiquetados, descuentosPendientes, clientes, listasPrecios, puntosVenta, ventas, cobrosClientes, planCuentas, tiposEgreso, proveedores, egresos, pagosProveedores, plantillasEgresos, mercaderiaPendiente, isLoading]);

  // --- Realtime Sync: poll for changes from other users every 10 seconds ---
  useEffect(() => {
    if (isLoading) return;

    const KEY_TO_SETTER: Record<string, (v: any) => void> = {
      alido_users: setUsers, alido_almacenes: setAlmacenes, alido_familias: setFamilias,
      alido_subfamilias: setSubfamilias, alido_unidades_medida: setUnidades,
      alido_productos: setProductos, alido_stock_seguridad: setStockSeguridad,
      alido_movimientos: setMovimientos, alido_recetas: setRecetas,
      alido_recetas_historial: setRecetasHistorial, alido_lotes_produccion: setLotesProduccion,
      alido_lotes_historial: setLotesHistorial, alido_plantillas_despiece: setPlantillasDespiece,
      alido_plantillas_despiece_historial: setPlantillasDespieceHistorial,
      alido_lotes_despiece: setLotesDespiece, alido_lotes_despiece_historial: setLotesDespieceHistorial,
      alido_lotes_etiquetados: setLotesEtiquetados, alido_descuentos_pendientes: setDescuentosPendientes,
      alido_clientes: setClientes, alido_listas_precios: setListasPrecios,
      alido_puntos_venta: setPuntosVenta, alido_ventas: setVentas,
      alido_cobros_clientes: setCobrosClientes, alido_plan_cuentas: setPlanCuentas,
      alido_tipos_egreso: setTiposEgreso, alido_proveedores: setProveedores,
      alido_egresos: setEgresos, alido_pagos_proveedores: setPagosProveedores,
      alido_plantillas_egresos: setPlantillasEgresos, alido_mercaderia_pendiente: setMercaderiaPendiente
    };

    const intervalId = setInterval(async () => {
      try {
        const updates = await checkForUpdates(lastSyncRef.current);
        if (updates.length > 0) {
          isApplyingRemoteRef.current = true;
          updates.forEach(({ key, value }) => {
            const setter = KEY_TO_SETTER[key];
            if (setter && value !== null && value !== undefined) {
              setter(value);
            }
          });
          lastSyncRef.current = new Date().toISOString();
          // Allow save effect to skip, then re-enable
          setTimeout(() => { isApplyingRemoteRef.current = false; }, 1500);
        }
      } catch (err) {
        console.error('Sync error:', err);
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(intervalId);
  }, [isLoading]);

  // --- Data Cleanup Period (Run once on init) ---
  useEffect(() => {
    let hasChangesMovements = false;
    let hasChangesLots = false;
    let newMovimientos = [...movimientos];
    let newLotesDespiece = [...lotesDespiece];

    // Cleanup Breakdown Lots
    lotesDespiece.forEach(lote => {
      if (lote.estado !== 'Finalizado') {
        // Check if it HAS entry movements even if not finalized
        const entries = newMovimientos.filter(m => {
          const isActivo = !(m.anulado === true || m.anulado === 'true' || m.estado === 'anulado');
          return isActivo && m.tipo === 'entrada' && (m.referencia === lote.numeroLote || m.motivo.includes(`Lote ${lote.numeroLote}`));
        });
        if (entries.length > 0) {
          newLotesDespiece = newLotesDespiece.map(ld => ld.id === lote.id ? { ...ld, estado: 'Finalizado' } : ld);
          hasChangesLots = true;
          lote.estado = 'Finalizado'; // Update local ref for next part
        }
      }

      if (lote.estado === 'Finalizado') {
        const associatedMovs = newMovimientos.filter(m => {
          const isActivo = !(m.anulado === true || m.anulado === 'true' || m.estado === 'anulado');
          return isActivo && (m.referencia === lote.numeroLote || m.motivo.includes(`Lote ${lote.numeroLote}`));
        });

        if (associatedMovs.length > 0) {
          // Keep only the latest "batch" of movements
          const sortedByTime = [...associatedMovs].sort((a, b) => new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime());
          const latestTimestamp = sortedByTime[0].fechaHora;
          const latestTime = new Date(latestTimestamp).getTime();

          const toAnnull = associatedMovs.filter(m => {
            const mTime = new Date(m.fechaHora).getTime();
            return Math.abs(latestTime - mTime) > 5000; // 5 seconds window
          });

          if (toAnnull.length > 0) {
            const annulIds = new Set(toAnnull.map(m => m.id));
            newMovimientos = newMovimientos.map(m => annulIds.has(m.id) ? { ...m, anulado: true } : m);
            hasChangesMovements = true;
          }

          // Verify quantities vs Lot data for the active ones (optional safety check)
          const remainingActive = associatedMovs.filter(m => {
            const mTime = new Date(m.fechaHora).getTime();
            return Math.abs(latestTime - mTime) <= 5000;
          });

          lote.cortes.forEach((c: any) => {
            const entry = remainingActive.find(m => m.tipo === 'entrada' && m.productoId === c.productoId);
            if (entry && Math.abs(entry.cantidadKg - c.cantidadReal) > 0.01) {
              // If mismatch, we could update it but user just wants latest.
            }
          });
        }
      }
    });

    if (hasChangesMovements) setMovimientos(newMovimientos);
    if (hasChangesLots) setLotesDespiece(newLotesDespiece);
  }, []);

  useEffect(() => {
    const handlePrintDelegation = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('#btn-imprimir-remito') || 
                  target.closest('[data-action="imprimir-remito"]') ||
                  target.closest('.btn-imprimir-remito');
      
      if (btn) {
        e.preventDefault();
        // Intentar encontrar el contenedor del remito
        const remitoContainer = document.querySelector('.remito-container');
        if (!remitoContainer) {
          console.warn('Delegación: Contenedor no encontrado en el DOM');
          return;
        }

        const remitoHTML = remitoContainer.innerHTML;
        const ventanaImpresion = window.open('', '_blank', 'width=1000,height=800');
        
        if (!ventanaImpresion) {
          globalAlert('Por favor habilite los popups para imprimir.');
          return;
        }

        ventanaImpresion.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
              <title>Remito - Alido Gestión</title>
              <style>
                  * { margin: 0; padding: 0; box-sizing: border-box; }
                  body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 20px; background: white; color: #333; }
                  .remito-wrapper { max-width: 210mm; margin: 0 auto; padding: 15mm; }
                  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #ddd; }
                  th { background-color: #f8fafc; font-weight: bold; font-size: 10px; color: #64748b; text-transform: uppercase; }
                  .no-print { display: block; text-align: center; margin-bottom: 20px; padding: 15px; background: #fff3cd; border-radius: 8px; }
                  .btn-print { padding: 10px 25px; background: #1A2B3C; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 900; text-transform: uppercase; }
                  @media print { .no-print { display: none !important; } body { padding: 0; } }
              </style>
          </head>
          <body>
              <div class="no-print">
                  <button class="btn-print" onclick="window.print()">🖨️ IMPRIMIR AHORA</button>
              </div>
              <div class="remito-wrapper">${remitoHTML}</div>
          </body>
          </html>
        `);
        ventanaImpresion.document.close();
        setTimeout(() => {
          ventanaImpresion.focus();
        }, 500);
      }
    };

    document.addEventListener('click', handlePrintDelegation);
    return () => document.removeEventListener('click', handlePrintDelegation);
  }, []);

  // --- Auth Handlers ---
  const handleLogin = (username: string, password: string) => {
    console.log('Intentando login con:', username);
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
    if (user) {
      setCurrentUser(user);
      localStorage.setItem('alido_logged_user', JSON.stringify(user));
      setActiveModule('INICIO');
      setActiveSubSection('Inicio');
      setExpandedModule(null);
      showNotification('Bienvenido al sistema Alido - Gestión', 'success');
    } else {
      console.error('Login fallido. Usuarios disponibles:', users.map(u => u.username));
      showNotification('Usuario o contraseña incorrectos', 'error');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('alido_logged_user');
  };

  // --- Helper Functions ---
  const showNotification = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };
  globalShowNotification = showNotification as any;

  const getPesoEquivalente = (productoId: string, lote?: LoteStock) => {
    const p = productos.find(prod => prod.id === productoId);
    if (!p) return 1;
    
    // Si la unidad es kg (u1), el factor SIEMPRE es 1 — no importa lo que diga el lote
    if (p.unidadMedidaId === 'u1') return 1;
    
    // Si el lote tiene un peso específico (en Movimientos futuro), priorizamos ese
    if (lote?.pesoEquivalenteReal) return lote.pesoEquivalenteReal;
    
    // Para PT usamos pesoNetoUnidad (ahora factor de conv)
    if (p.tipo === 'Producto Terminado') return p.pesoNetoUnidad || 1;
    
    // Para MP usamos el nuevo campo pesoEquivalenteKg
    if (p.tipo === 'Materia Prima') return p.pesoEquivalenteKg || 1;
    
    return 1;
  };

  const getStockActual = (productoId: string, almacenId?: string) => {
    return lotesStock
      .filter(l => l.productoId === productoId && (!almacenId || l.almacenId === almacenId))
      .reduce((sum, l) => sum + l.cantidad, 0);
  };

  const getOcupacionAlmacen = (almacenId: string) => {
    return lotesStock
      .filter(l => l.almacenId === almacenId)
      .reduce((sum, l) => sum + (l.cantidad * getPesoEquivalente(l.productoId, l)), 0);
  };

  const getStockSeguridad = (productoId: string, almacenId: string) => {
    const ss = stockSeguridad.find(s => s.productoId === productoId && s.almacenId === almacenId);
    return ss ? ss.cantidad : 0;
  };

  const getAlertasAlmacen = (almacenId: string) => {
    const stockLotes = lotesStock.filter(l => l.almacenId === almacenId);
    const productosEnAlmacen = Array.from(new Set(stockLotes.map(l => l.productoId))) as string[];
    const hoy = new Date();
    
    let stockBajo = 0;
    let proximosVencer = 0;

    productosEnAlmacen.forEach((pid: string) => {
      const actual = getStockActual(pid, almacenId);
      const seguridad = getStockSeguridad(pid, almacenId);
      if (seguridad > 0 && actual < seguridad) stockBajo++;
    });

    stockLotes.forEach(l => {
      const venc = parseISO(l.fechaVencimiento);
      if (safeIsAfter(venc, hoy) && safeDiffDays(venc, hoy) <= 7) {
        proximosVencer++;
      }
    });

    return { stockBajo, proximosVencer };
  };

  // --- Render Logic ---

  if (isLoading) return (
    <div className="flex h-screen items-center justify-center bg-sleek-bg">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sleek-accent mx-auto mb-4"></div>
        <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">Cargando datos...</p>
        <p className="text-slate-400 text-xs mt-2">Conectando con el servidor</p>
      </div>
    </div>
  );

  if (!currentUser) return <LoginView onLogin={handleLogin} />;

  return (
    <div className="flex h-screen overflow-hidden bg-sleek-bg">
      {/* Sidebar */}
      <aside className={cn(
        "bg-sleek-dark text-white transition-all duration-300 flex flex-col",
        sidebarExpanded ? "w-[260px]" : "w-20"
      )}>
        <div className="p-8 flex flex-col items-center gap-4 border-b border-white/10">
          <img src="/alido-logo.png" alt="Logo" className="h-12" />
          {sidebarExpanded && <span className="font-bold text-lg uppercase tracking-[0.2em]">Alido</span>}
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          <SidebarHomeItem
            activeModule={activeModule}
            setActiveModule={setActiveModule}
            setActiveSubSection={setActiveSubSection}
            setExpandedModule={setExpandedModule}
            sidebarExpanded={sidebarExpanded}
          />
          <SidebarItem 
            icon={Package} 
            label="INVENTARIO" 
            module="INVENTARIO" 
            activeModule={activeModule}
            activeSubSection={activeSubSection}
            expandedModule={expandedModule}
            setExpandedModule={setExpandedModule}
            setActiveModule={setActiveModule}
            setActiveSubSection={setActiveSubSection}
            subItems={['Dashboard', 'Almacenes', 'Productos', 'Movimientos', 'Alertas', 'Reportes']} 
            sidebarExpanded={sidebarExpanded}
            currentUser={currentUser}
          />
          <SidebarItem 
            icon={Factory} 
            label="PRODUCCIÓN" 
            module="PRODUCCIÓN" 
            activeModule={activeModule}
            activeSubSection={activeSubSection}
            expandedModule={expandedModule}
            setExpandedModule={setExpandedModule}
            setActiveModule={setActiveModule}
            setActiveSubSection={setActiveSubSection}
            subItems={['Lotes de Producción', 'Lotes de Despiece', 'Recetas Estándar', 'Plantillas de Despiece', 'Etiquetas', 'Dashboard', 'Trazabilidad']} 
            sidebarExpanded={sidebarExpanded}
            currentUser={currentUser}
          />
          <SidebarItem 
            icon={DollarSign} 
            label="VENTAS" 
            module="VENTAS" 
            activeModule={activeModule}
            activeSubSection={activeSubSection}
            expandedModule={expandedModule}
            setExpandedModule={setExpandedModule}
            setActiveModule={setActiveModule}
            setActiveSubSection={setActiveSubSection}
            subItems={['Ventas y Pedidos', 'Clientes', 'Listas de Precios', 'Puntos de Venta']} 
            sidebarExpanded={sidebarExpanded}
            currentUser={currentUser}
          />
          <SidebarItem 
            icon={CreditCard} 
            label="EGRESOS" 
            module="EGRESOS" 
            activeModule={activeModule}
            activeSubSection={activeSubSection}
            expandedModule={expandedModule}
            setExpandedModule={setExpandedModule}
            setActiveModule={setActiveModule}
            setActiveSubSection={setActiveSubSection}
            subItems={['Egresos y Compras', 'Proveedores', 'Tipos de Egreso', 'Plan de Cuentas']} 
            sidebarExpanded={sidebarExpanded}
            currentUser={currentUser}
          />
          <SidebarItem 
            icon={Users} 
            label="USUARIOS" 
            module="USUARIOS" 
            activeModule={activeModule}
            activeSubSection={activeSubSection}
            expandedModule={expandedModule}
            setExpandedModule={setExpandedModule}
            setActiveModule={setActiveModule}
            setActiveSubSection={setActiveSubSection}
            subItems={['Gestión de Usuarios']} 
            sidebarExpanded={sidebarExpanded}
            currentUser={currentUser}
          />
        </nav>

        <div className="p-6 border-t border-white/10 space-y-8">
          {sidebarExpanded && (
            <div className="flex flex-col items-center gap-3 opacity-40 hover:opacity-100 transition-opacity">
              <p className="text-[8px] font-bold uppercase tracking-widest text-white/60">Desarrollado por</p>
              <img src="/basal-logo.png" alt="Basal Logo" className="h-6 brightness-0 invert" />
            </div>
          )}
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded bg-white/5 text-white/60 hover:bg-sleek-danger hover:text-white transition-all text-xs font-bold uppercase tracking-widest"
          >
            <LogOut className="w-4 h-4" />
            {sidebarExpanded && <span>Cerrar Sesión</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 z-10">
          <div className="flex items-center gap-6">
            <button onClick={() => setSidebarExpanded(!sidebarExpanded)} className="p-2 hover:bg-slate-100 rounded text-slate-400">
              <ChevronRight className={cn("w-5 h-5 transition-transform", sidebarExpanded && "rotate-180")} />
            </button>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              {activeModule} / {activeSubSection}
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-bold text-sleek-dark">{currentUser.name}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{currentUser.role}</p>
              </div>
              <div className="w-9 h-9 rounded bg-sleek-dark flex items-center justify-center text-white text-sm font-bold">
                {currentUser.name.charAt(0)}
              </div>
            </div>
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto">
            {!hasPermission(currentUser, activeModule, activeSubSection) ? (
              <div className="flex flex-col items-center justify-center h-[60vh] text-slate-300">
                <ShieldAlert className="w-16 h-16 mb-4 opacity-10" />
                <p className="text-lg font-bold uppercase tracking-widest">Acceso Denegado</p>
                <p className="text-xs mt-2">No tenés permisos para ver esta sección.</p>
              </div>
            ) : (
              <>
                {activeModule === 'INICIO' && (
                  <InicioView
                    currentUser={currentUser}
                    productos={productos}
                    lotesProduccion={lotesProduccion}
                    lotesDespiece={lotesDespiece}
                    lotesEtiquetados={lotesEtiquetados}
                    movimientos={movimientos}
                    almacenes={almacenes}
                    unidades={unidades}
                    lotesStock={lotesStock}
                    users={users}
                    stockSeguridad={stockSeguridad}
                    setActiveModule={setActiveModule}
                    setActiveSubSection={setActiveSubSection}
                    setExpandedModule={setExpandedModule}
                  />
                )}
                {activeModule === 'INVENTARIO' && activeSubSection === 'Dashboard' && (
                  <InventarioDashboard 
                    almacenes={almacenes}
                    getOcupacionAlmacen={getOcupacionAlmacen}
                    getAlertasAlmacen={getAlertasAlmacen}
                    setActiveSubSection={setActiveSubSection}
                    setEditingItem={setEditingItem}
                    movimientos={movimientos}
                    productos={productos}
                    lotesStock={lotesStock}
                    getPesoEquivalente={getPesoEquivalente}
                  />
                )}
            {activeModule === 'INVENTARIO' && activeSubSection === 'Productos' && (
              <ProductosView 
                productos={productos}
                setProductos={setProductos}
                familias={familias}
                setFamilias={setFamilias}
                subfamilias={subfamilias}
                setSubfamilias={setSubfamilias}
                unidades={unidades}
                setUnidades={setUnidades}
                recetas={recetas}
                setRecetas={setRecetas}
                showNotification={showNotification}
              />
            )}
            {activeModule === 'INVENTARIO' && activeSubSection === 'Almacenes' && (
              <AlmacenesView 
                lotesEtiquetados={lotesEtiquetados}
                lotesStock={lotesStock}
                productos={productos}
                getOcupacionAlmacen={getOcupacionAlmacen}
                getStockActual={getStockActual}
                getStockSeguridad={getStockSeguridad}
                getAlertasAlmacen={getAlertasAlmacen}
                getPesoEquivalente={getPesoEquivalente}
                almacenes={almacenes}
                setModalType={setModalType}
                setIsModalOpen={setIsModalOpen}
                setEditingItem={setEditingItem}
                setAlmacenes={setAlmacenes}
                showNotification={showNotification}
                unidades={unidades}
                stockSeguridad={stockSeguridad}
                setStockSeguridad={setStockSeguridad}
                lotesProduccion={lotesProduccion}
                lotesDespiece={lotesDespiece}
              />
            )}
            {activeModule === 'PRODUCCIÓN' && activeSubSection === 'Recetas Estándar' && (
              <RecetasProduccionView 
                recetas={recetas}
                setRecetas={setRecetas}
                recetasHistorial={recetasHistorial}
                setRecetasHistorial={setRecetasHistorial}
                productos={productos}
                familias={familias}
                subfamilias={subfamilias}
                unidades={unidades}
                currentUser={currentUser}
                showNotification={showNotification}
                getPesoEquivalente={getPesoEquivalente}
              />
            )}
            {activeModule === 'PRODUCCIÓN' && activeSubSection === 'Plantillas de Despiece' && (
              <PlantillasDespieceView 
                plantillasDespiece={plantillasDespiece}
                setPlantillasDespiece={setPlantillasDespiece}
                plantillasDespieceHistorial={plantillasDespieceHistorial}
                setPlantillasDespieceHistorial={setPlantillasDespieceHistorial}
                productos={productos}
                unidades={unidades}
                users={users}
                currentUser={currentUser}
                showNotification={showNotification}
                getPesoEquivalente={getPesoEquivalente}
              />
            )}
            {activeModule === 'PRODUCCIÓN' && activeSubSection === 'Lotes de Producción' && (
              <LotesProduccionView 
                lotesProduccion={lotesProduccion}
                setLotesProduccion={setLotesProduccion}
                lotesHistorial={lotesHistorial}
                setLotesHistorial={setLotesHistorial}
                recetas={recetas}
                productos={productos}
                almacenes={almacenes}
                lotesStock={lotesStock}
                movimientos={movimientos}
                setMovimientos={setMovimientos}
                unidades={unidades}
                users={users}
                currentUser={currentUser}
                showNotification={showNotification}
                getPesoEquivalente={getPesoEquivalente}
                lotesEtiquetados={lotesEtiquetados}
                setLotesEtiquetados={setLotesEtiquetados}
                setDescuentosPendientes={setDescuentosPendientes}
              />
            )}
            {activeModule === 'PRODUCCIÓN' && activeSubSection === 'Lotes de Despiece' && (
              <LotesDespieceView 
                lotesDespiece={lotesDespiece}
                setLotesDespiece={setLotesDespiece}
                lotesDespieceHistorial={lotesDespieceHistorial}
                setLotesDespieceHistorial={setLotesDespieceHistorial}
                plantillasDespiece={plantillasDespiece}
                productos={productos}
                almacenes={almacenes}
                lotesStock={lotesStock}
                movimientos={movimientos}
                setMovimientos={setMovimientos}
                unidades={unidades}
                users={users}
                currentUser={currentUser}
                showNotification={showNotification}
                getPesoEquivalente={getPesoEquivalente}
                lotesEtiquetados={lotesEtiquetados}
                setLotesEtiquetados={setLotesEtiquetados}
                setDescuentosPendientes={setDescuentosPendientes}
              />
            )}
            {activeModule === 'PRODUCCIÓN' && activeSubSection === 'Etiquetas' && (
              <EtiquetasView 
                lotesProduccion={lotesProduccion}
                setLotesProduccion={setLotesProduccion}
                lotesDespiece={lotesDespiece}
                setLotesDespiece={setLotesDespiece}
                lotesHistorial={lotesHistorial}
                setLotesHistorial={setLotesHistorial}
                lotesDespieceHistorial={lotesDespieceHistorial}
                setLotesDespieceHistorial={setLotesDespieceHistorial}
                productos={productos}
                almacenes={almacenes}
                recetas={recetas}
                plantillasDespiece={plantillasDespiece}
                movimientos={movimientos}
                setMovimientos={setMovimientos}
                lotesStock={lotesStock}
                unidades={unidades}
                familias={familias}
                subfamilias={subfamilias}
                currentUser={currentUser}
                showNotification={showNotification}
                getPesoEquivalente={getPesoEquivalente}
                lotesEtiquetados={lotesEtiquetados}
                setLotesEtiquetados={setLotesEtiquetados}
                setDescuentosPendientes={setDescuentosPendientes}
              />
            )}
    {activeModule === 'INVENTARIO' && activeSubSection === 'Movimientos' && (
      <MovimientosView 
        movimientos={movimientos}
        setMovimientos={setMovimientos}
        productos={productos}
        almacenes={almacenes}
        unidades={unidades}
        currentUser={currentUser}
        showNotification={showNotification}
        getPesoEquivalente={getPesoEquivalente}
        lotesStock={lotesStock}
        descuentosPendientes={descuentosPendientes}
        setDescuentosPendientes={setDescuentosPendientes}
        mercaderiaPendiente={mercaderiaPendiente}
        setMercaderiaPendiente={setMercaderiaPendiente}
      />
    )}
            {activeModule === 'USUARIOS' && activeSubSection === 'Gestión de Usuarios' && (
              <UsuariosView 
                users={users}
                setModalType={setModalType}
                setIsModalOpen={setIsModalOpen}
                setEditingItem={setEditingItem}
                setUsers={setUsers}
                showNotification={showNotification}
                loggedUser={currentUser}
              />
            )}

            {activeModule === 'VENTAS' && activeSubSection === 'Ventas y Pedidos' && (
              <VentasPedidosView 
                ventas={ventas}
                setVentas={setVentas}
                clientes={clientes}
                listasPrecios={listasPrecios}
                puntosVenta={puntosVenta}
                productos={productos}
                lotesStock={lotesStock}
                movimientos={movimientos}
                setMovimientos={setMovimientos}
                lotesEtiquetados={lotesEtiquetados}
                setLotesEtiquetados={setLotesEtiquetados}
                unidades={unidades}
                almacenes={almacenes}
                currentUser={currentUser}
                showNotification={showNotification}
              />
            )}
            {activeModule === 'VENTAS' && activeSubSection === 'Clientes' && (
              <ClientesView 
                clientes={clientes}
                setClientes={setClientes}
                listasPrecios={listasPrecios}
                productos={productos}
                ventas={ventas}
                setVentas={setVentas}
                cobrosClientes={cobrosClientes}
                setCobrosClientes={setCobrosClientes}
                currentUser={currentUser}
                showNotification={showNotification}
              />
            )}
            {activeModule === 'VENTAS' && activeSubSection === 'Listas de Precios' && (
              <ListasPreciosView 
                listasPrecios={listasPrecios}
                setListasPrecios={setListasPrecios}
                productos={productos}
                familias={familias}
                subfamilias={subfamilias}
                currentUser={currentUser}
                showNotification={showNotification}
              />
            )}
            {activeModule === 'VENTAS' && activeSubSection === 'Puntos de Venta' && (
              <PuntosVentaView 
                puntosVenta={puntosVenta}
                setPuntosVenta={setPuntosVenta}
                users={users}
                showNotification={showNotification}
              />
            )}

            {activeModule === 'EGRESOS' && activeSubSection === 'Egresos y Compras' && (
              <EgresosView 
                egresos={egresos}
                setEgresos={setEgresos}
                tiposEgreso={tiposEgreso}
                proveedores={proveedores}
                planCuentas={planCuentas}
                productos={productos}
                almacenes={almacenes}
                mercaderiaPendiente={mercaderiaPendiente}
                setMercaderiaPendiente={setMercaderiaPendiente}
                plantillasEgresos={plantillasEgresos}
                setPlantillasEgresos={setPlantillasEgresos}
                movimientos={movimientos}
                setMovimientos={setMovimientos}
                currentUser={currentUser}
                showNotification={showNotification}
              />
            )}
            {activeModule === 'EGRESOS' && activeSubSection === 'Proveedores' && (
              <ProveedoresView 
                proveedores={proveedores}
                setProveedores={setProveedores}
                egresos={egresos}
                pagosProveedores={pagosProveedores}
                setPagosProveedores={setPagosProveedores}
                tiposEgreso={tiposEgreso}
                planCuentas={planCuentas}
                currentUser={currentUser}
                showNotification={showNotification}
              />
            )}
            {activeModule === 'EGRESOS' && activeSubSection === 'Tipos de Egreso' && (
              <TiposEgresoView 
                tiposEgreso={tiposEgreso}
                setTiposEgreso={setTiposEgreso}
                planCuentas={planCuentas}
                showNotification={showNotification}
              />
            )}
            {activeModule === 'EGRESOS' && activeSubSection === 'Plan de Cuentas' && (
              <PlanCuentasView 
                planCuentas={planCuentas}
                setPlanCuentas={setPlanCuentas}
                showNotification={showNotification}
              />
            )}
            
            {/* Placeholder for other views */}
            {activeModule !== 'INICIO' && !['Dashboard', 'Almacenes', 'Productos', 'Movimientos', 'Etiquetas', 'Lotes de Producción', 'Lotes de Despiece', 'Recetas Estándar', 'Plantillas de Despiece', 'Gestión de Usuarios', 'Ventas y Pedidos', 'Clientes', 'Listas de Precios', 'Puntos de Venta', 'Egresos y Compras', 'Proveedores', 'Tipos de Egreso', 'Plan de Cuentas', 'Inicio'].includes(activeSubSection) && (
              <div className="flex flex-col items-center justify-center h-[60vh] text-slate-300">
                <Settings className="w-16 h-16 mb-4 opacity-10" />
                <p className="text-lg font-bold uppercase tracking-widest">Módulo en Desarrollo</p>
                <p className="text-xs mt-2">Esta sección se está implementando para el entorno real.</p>
              </div>
            )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Notifications */}
      {notification && (
        <div className={cn(
          "fixed bottom-8 right-8 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-bounce z-[100]",
          notification.type === 'success' ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
        )}>
          {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          <span className="font-bold">{notification.message}</span>
        </div>
      )}

      {/* Modals */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={
          modalType === 'ALMACEN_FORM' ? (editingItem ? 'Editar Almacén' : 'Nuevo Almacén') :
          modalType === 'STOCK_SEGURIDAD_FORM' ? 'Configurar Stock de Seguridad' :
          modalType === 'ASIGNAR_PRODUCTO_FORM' ? 'Agregar Producto al Almacén' :
          modalType === 'USER_FORM' ? (editingItem ? 'Editar Usuario' : 'Nuevo Usuario') :
          editingItem ? 'Editar Registro' : 'Nuevo Registro'
        }
      >
        {modalType === 'USER_FORM' && (
          <UserForm 
            editingItem={editingItem}
            loggedUser={currentUser}
            onClose={() => setIsModalOpen(false)}
            onSave={(data: any) => {
              if (editingItem) {
                setUsers(users.map((u: any) => u.id === editingItem.id ? data : u));
                showNotification('Usuario actualizado', 'success');
              } else {
                setUsers([...users, { ...data, id: `usr-${Date.now()}` }]);
                showNotification('Usuario creado con éxito', 'success');
              }
              setIsModalOpen(false);
            }}
          />
        )}
        {modalType === 'ALMACEN_FORM' && (
          <AlmacenForm 
            editingItem={editingItem}
            unidades={unidades}
            onClose={() => setIsModalOpen(false)}
            onSave={(data: any) => {
              if (editingItem) {
                setAlmacenes(almacenes.map((a: any) => a.id === editingItem.id ? data : a));
                showNotification('Almacén actualizado', 'success');
              } else {
                setAlmacenes([...almacenes, data]);
                showNotification('Almacén creado con éxito', 'success');
              }
              setIsModalOpen(false);
            }}
          />
        )}
        {modalType === 'STOCK_SEGURIDAD_FORM' && (
          <StockSeguridadForm 
            editingItem={editingItem}
            onClose={() => setIsModalOpen(false)}
            onSave={(cantidad: number) => {
              setStockSeguridad(stockSeguridad.map((s: any) => 
                (s.productoId === editingItem.productoId && s.almacenId === editingItem.almacenId) 
                ? { ...s, cantidad } : s
              ));
              showNotification('Stock de seguridad actualizado', 'success');
              setIsModalOpen(false);
            }}
          />
        )}
        {modalType === 'ASIGNAR_PRODUCTO_FORM' && (
          <AsignarProductoForm 
            almacenId={editingItem?.almacenId}
            productos={productos.filter((p: any) => !stockSeguridad.some((s: any) => s.productoId === p.id && s.almacenId === editingItem?.almacenId))}
            onClose={() => setIsModalOpen(false)}
            onSave={(data: any) => {
              setStockSeguridad([...stockSeguridad, data]);
              showNotification('Producto asignado al almacén', 'success');
              setIsModalOpen(false);
            }}
          />
        )}
        {!['ALMACEN_FORM', 'STOCK_SEGURIDAD_FORM', 'ASIGNAR_PRODUCTO_FORM', 'USER_FORM'].includes(modalType) && (
          <>
            <p>Formulario de carga para {modalType}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-500 font-bold">Cancelar</button>
              <button onClick={() => { setIsModalOpen(false); showNotification('Guardado con éxito', 'success'); }} className="px-6 py-2 bg-amber-500 text-white font-bold rounded-lg">Guardar</button>
            </div>
          </>
        )}
      </Modal>

      {confirmModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-sleek-dark font-black text-lg mb-2">Confirmación</h3>
            <p className="text-slate-600 font-medium text-sm mb-6">{confirmModal.msg}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmModal(null)} className="px-4 py-2 hover:bg-slate-100 rounded-xl text-slate-600 text-sm font-bold transition-colors">Cancelar</button>
              <button onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }} className="px-4 py-2 bg-sleek-danger text-white rounded-xl text-sm font-bold shadow-lg shadow-sleek-danger/20 hover:bg-rose-600 transition-colors">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
