import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

export interface Delegacion {
  id: number;
  nombre: string;
  activa: boolean;
}

export interface Periodo {
  id: number;
  fecha_inicio: string;
  fecha_fin: string;
  dias_computables: number;
  activo: boolean;
  label: string;
}

export interface CatalogoServicio {
  id: number;
  nombre_servicio: string;
  categoria: string;
  activo: boolean;
}

export interface User {
  id: number;
  username: string;
  email: string;
  passwordHash: string;
  is_superuser: boolean;
  delegacion_id: number;
  rol: 'ADMIN' | 'DELEGADO' | 'FUNCIONARIO' | 'VERIFICADOR';
}

export interface MetaItem {
  id: number;
  delegacion_id: number;
  cargo_o_usuario: string;
  descripcion: string;
  ponderacion: number;
  periodo_id: number;
  evidencia: string | null;
  evidencias_archivadas?: string[];
  deleted_at: string | null;
}

export interface PasswordResetCodeItem {
  id: number;
  user_id: number;
  code_hash: string;
  raw_code?: string;
  created_at: string;
  expires_at: string;
  is_used: boolean;
  failed_attempts: number;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'sgr_store.json');

class Store {
  delegaciones: Delegacion[] = [];
  periodos: Periodo[] = [];
  servicios: CatalogoServicio[] = [];
  users: User[] = [];
  metas: MetaItem[] = [];
  resetCodes: PasswordResetCodeItem[] = [];

  nextMetaId = 8;
  nextResetCodeId = 1;
  nextDelegacionId = 5;
  nextPeriodoId = 3;
  nextServicioId = 5;
  nextUserId = 6;

  constructor() {
    this.init();
  }

  private init() {
    if (fs.existsSync(DATA_FILE)) {
      try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const data = JSON.parse(raw);
        this.delegaciones = data.delegaciones || [];
        this.periodos = data.periodos || [];
        this.servicios = data.servicios || [];
        this.users = data.users || [];
        this.metas = data.metas || [];
        this.resetCodes = data.resetCodes || [];
        this.nextMetaId = data.nextMetaId || 8;
        this.nextResetCodeId = data.nextResetCodeId || 1;
        this.nextDelegacionId = data.nextDelegacionId || 5;
        this.nextPeriodoId = data.nextPeriodoId || 3;
        this.nextServicioId = data.nextServicioId || 5;
        this.nextUserId = data.nextUserId || 6;
        return;
      } catch (e) {
        console.warn('Could not read existing store file, initializing defaults');
      }
    }
    this.seedDefaults();
    this.save();
  }

  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = {
        delegaciones: this.delegaciones,
        periodos: this.periodos,
        servicios: this.servicios,
        users: this.users,
        metas: this.metas,
        resetCodes: this.resetCodes,
        nextMetaId: this.nextMetaId,
        nextResetCodeId: this.nextResetCodeId,
        nextDelegacionId: this.nextDelegacionId,
        nextPeriodoId: this.nextPeriodoId,
        nextServicioId: this.nextServicioId,
        nextUserId: this.nextUserId,
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.warn('Failed to save store to file', e);
    }
  }

  seedDefaults() {
    this.delegaciones = [
      { id: 1, nombre: 'Delegación La Serena Centro', activa: true },
      { id: 2, nombre: 'Delegación Las Compañías', activa: true },
      { id: 3, nombre: 'Delegación Rural (Algarrobito y El Romero)', activa: true },
      { id: 4, nombre: 'Delegación Avenida del Mar', activa: false },
    ];

    this.periodos = [
      {
        id: 1,
        fecha_inicio: '2026-01-01',
        fecha_fin: '2026-12-31',
        dias_computables: 240,
        activo: true,
        label: 'Período 2026 (2026-01-01 a 2026-12-31)',
      },
      {
        id: 2,
        fecha_inicio: '2025-01-01',
        fecha_fin: '2025-12-31',
        dias_computables: 245,
        activo: false,
        label: 'Período 2025 (2025-01-01 a 2025-12-31)',
      },
    ];

    this.servicios = [
      { id: 1, nombre_servicio: 'Atención y Orientación Social', categoria: 'DIDECO', activo: true },
      { id: 2, nombre_servicio: 'Recepción y Tramitación de Permisos', categoria: 'Rentas y Patentes', activo: true },
      { id: 3, nombre_servicio: 'Fiscalización en Vía Pública', categoria: 'Seguridad Ciudadana', activo: true },
      { id: 4, nombre_servicio: 'Mantenimiento de Áreas Verdes', categoria: 'Operaciones', activo: true },
    ];

    this.users = [
      {
        id: 1,
        username: 'admin',
        email: 'admin@laserena.cl',
        passwordHash: bcrypt.hashSync('admin1234', 8),
        is_superuser: true,
        delegacion_id: 1,
        rol: 'ADMIN',
      },
      {
        id: 2,
        username: 'funcionario1',
        email: 'funcionario@laserena.cl',
        passwordHash: bcrypt.hashSync('user1234', 8),
        is_superuser: false,
        delegacion_id: 1,
        rol: 'FUNCIONARIO',
      },
      {
        id: 3,
        username: 'delegado_companias',
        email: 'delegado@laserena.cl',
        passwordHash: bcrypt.hashSync('laserena2026', 8),
        is_superuser: false,
        delegacion_id: 2,
        rol: 'DELEGADO',
      },
      {
        id: 4,
        username: 'funcionario_rural',
        email: 'rural@laserena.cl',
        passwordHash: bcrypt.hashSync('laserena2026', 8),
        is_superuser: false,
        delegacion_id: 3,
        rol: 'FUNCIONARIO',
      },
      {
        id: 5,
        username: 'verificador_municipal',
        email: 'verificador@laserena.cl',
        passwordHash: bcrypt.hashSync('laserena2026', 8),
        is_superuser: false,
        delegacion_id: 1,
        rol: 'VERIFICADOR',
      },
    ];

    this.metas = [
      // Delegación 1: La Serena Centro (Total 100%)
      {
        id: 1,
        delegacion_id: 1,
        cargo_o_usuario: 'Analista de Atención Ciudadana',
        descripcion: 'Atención y resolución oportuna de solicitudes ciudadanas presenciales en Delegación Centro.',
        ponderacion: 30,
        periodo_id: 1,
        evidencia: '/media/evidencias/2026/10/hjhjhjj.jpg',
        deleted_at: null,
      },
      {
        id: 2,
        delegacion_id: 1,
        cargo_o_usuario: 'Coordinador de Terreno',
        descripcion: 'Inspecciones técnicas en terreno y levantamiento de requerimientos comunales.',
        ponderacion: 40,
        periodo_id: 1,
        evidencia: '/media/evidencias/2026/10/images_1.jpg',
        deleted_at: null,
      },
      {
        id: 3,
        delegacion_id: 1,
        cargo_o_usuario: 'Encargado de Gestión Social',
        descripcion: 'Seguimiento y apoyo a programas sociales en sectores prioritarios del centro.',
        ponderacion: 30,
        periodo_id: 1,
        evidencia: null,
        deleted_at: null,
      },
      // Delegación 2: Las Compañías (Total 100%)
      {
        id: 4,
        delegacion_id: 2,
        cargo_o_usuario: 'Jefe de Delegación Las Compañías',
        descripcion: 'Supervisión general de operativos y servicios municipales descentralizados en el sector Las Compañías.',
        ponderacion: 50,
        periodo_id: 1,
        evidencia: null,
        deleted_at: null,
      },
      {
        id: 5,
        delegacion_id: 2,
        cargo_o_usuario: 'Inspector Territorial Las Compañías',
        descripcion: 'Fiscalización y control de ordenanza municipal en ferias libres y comercio sectorial.',
        ponderacion: 50,
        periodo_id: 1,
        evidencia: null,
        deleted_at: null,
      },
      // Delegación 3: Rural (Total 100%)
      {
        id: 6,
        delegacion_id: 3,
        cargo_o_usuario: 'Gestor Comunitario Rural',
        descripcion: 'Operativos de abastecimiento de agua y apoyo técnico social a juntas de vecinos de Algarrobito y El Romero.',
        ponderacion: 60,
        periodo_id: 1,
        evidencia: null,
        deleted_at: null,
      },
      {
        id: 7,
        delegacion_id: 3,
        cargo_o_usuario: 'Coordinador Operativo Rural',
        descripcion: 'Mantenimiento de caminos vecinales y coordinación con APR en localidades rurales.',
        ponderacion: 40,
        periodo_id: 1,
        evidencia: null,
        deleted_at: null,
      },
    ];

    this.nextMetaId = 8;
    this.nextUserId = 6;
  }

  // Delegaciones
  getDelegaciones(): Delegacion[] {
    return this.delegaciones;
  }

  getDelegacion(id: number): Delegacion | undefined {
    return this.delegaciones.find((d) => d.id === id);
  }

  createDelegacion(nombre: string, activa: boolean): Delegacion {
    const d: Delegacion = {
      id: this.nextDelegacionId++,
      nombre: nombre.trim(),
      activa,
    };
    this.delegaciones.push(d);
    this.save();
    return d;
  }

  updateDelegacion(id: number, data: Partial<Delegacion>): Delegacion | undefined {
    const d = this.getDelegacion(id);
    if (!d) return undefined;
    if (data.nombre !== undefined) d.nombre = data.nombre.trim();
    if (data.activa !== undefined) d.activa = data.activa;
    this.save();
    return d;
  }

  // Periodos
  getPeriodos(): Periodo[] {
    return this.periodos;
  }

  getPeriodo(id: number): Periodo | undefined {
    return this.periodos.find((p) => p.id === id);
  }

  createPeriodo(data: { fecha_inicio: string; fecha_fin: string; dias_computables: number; activo: boolean }): Periodo {
    const year = data.fecha_inicio.substring(0, 4);
    const p: Periodo = {
      id: this.nextPeriodoId++,
      fecha_inicio: data.fecha_inicio,
      fecha_fin: data.fecha_fin,
      dias_computables: data.dias_computables,
      activo: data.activo,
      label: `Período ${year} (${data.fecha_inicio} a ${data.fecha_fin})`,
    };
    this.periodos.push(p);
    this.save();
    return p;
  }

  updatePeriodo(id: number, data: Partial<Periodo>): Periodo | undefined {
    const p = this.getPeriodo(id);
    if (!p) return undefined;
    if (data.fecha_inicio !== undefined) p.fecha_inicio = data.fecha_inicio;
    if (data.fecha_fin !== undefined) p.fecha_fin = data.fecha_fin;
    if (data.dias_computables !== undefined) p.dias_computables = data.dias_computables;
    if (data.activo !== undefined) p.activo = data.activo;
    const year = p.fecha_inicio.substring(0, 4);
    p.label = `Período ${year} (${p.fecha_inicio} a ${p.fecha_fin})`;
    this.save();
    return p;
  }

  // Servicios
  getServicios(): CatalogoServicio[] {
    return this.servicios;
  }

  createServicio(nombre: string, categoria: string, activo: boolean): CatalogoServicio {
    const s: CatalogoServicio = {
      id: this.nextServicioId++,
      nombre_servicio: nombre.trim(),
      categoria: categoria.trim(),
      activo,
    };
    this.servicios.push(s);
    this.save();
    return s;
  }

  updateServicio(id: number, data: Partial<CatalogoServicio>): CatalogoServicio | undefined {
    const s = this.servicios.find((item) => item.id === id);
    if (!s) return undefined;
    if (data.nombre_servicio !== undefined) s.nombre_servicio = data.nombre_servicio.trim();
    if (data.categoria !== undefined) s.categoria = data.categoria.trim();
    if (data.activo !== undefined) s.activo = data.activo;
    this.save();
    return s;
  }

  // Users
  getUser(id: number): User | undefined {
    return this.users.find((u) => u.id === id);
  }

  getUserByUsername(username: string): User | undefined {
    return this.users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
  }

  getUserByEmail(email: string): User | undefined {
    return this.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  }

  createUser(data: {
    username: string;
    email: string;
    password: string;
    delegacion_id: number;
    rol: User['rol'];
    is_superuser: boolean;
  }): { success: boolean; error?: string; user?: User } {
    if (this.getUserByUsername(data.username)) {
      return { success: false, error: 'El nombre de usuario ya existe.' };
    }
    if (this.getUserByEmail(data.email)) {
      return { success: false, error: 'El correo electrónico ya está registrado.' };
    }
    const delegacion = this.getDelegacion(data.delegacion_id);
    if (!delegacion || !delegacion.activa) {
      return { success: false, error: 'No se puede asignar un usuario a una delegación inactiva.' };
    }

    const u: User = {
      id: this.nextUserId++,
      username: data.username.trim(),
      email: data.email.trim().toLowerCase(),
      passwordHash: bcrypt.hashSync(data.password, 8),
      is_superuser: data.is_superuser,
      delegacion_id: data.delegacion_id,
      rol: data.rol,
    };
    this.users.push(u);
    this.save();
    return { success: true, user: u };
  }

  // Metas Query with Strict Delegation Scoping
  getMetas(options: {
    user?: User | null;
    delegacionId?: number;
    periodoId?: number;
    search?: string;
    includeArchived?: boolean;
  }): (MetaItem & { periodoLabel: string; delegacionNombre: string })[] {
    let list = this.metas;

    // Filter archived vs active
    if (!options.includeArchived) {
      list = list.filter((m) => m.deleted_at === null);
    } else {
      list = list.filter((m) => m.deleted_at !== null);
    }

    // Role-based delegation scoping:
    // If the user is logged in and is NOT an admin, STRICTLY filter by their own delegation.
    // They cannot see metas of any other delegation under any circumstances.
    if (options.user && !options.user.is_superuser && options.user.rol !== 'ADMIN') {
      list = list.filter((m) => m.delegacion_id === options.user!.delegacion_id);
    } else if (options.delegacionId) {
      // Admins (or the public portal) can filter by a selected delegation
      list = list.filter((m) => m.delegacion_id === options.delegacionId);
    }

    if (options.periodoId) {
      list = list.filter((m) => m.periodo_id === options.periodoId);
    }

    if (options.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.cargo_o_usuario.toLowerCase().includes(q) ||
          m.descripcion.toLowerCase().includes(q)
      );
    }

    return list.map((m) => {
      const p = this.getPeriodo(m.periodo_id);
      const d = this.getDelegacion(m.delegacion_id);
      return {
        ...m,
        periodoLabel: p ? p.label : `Período #${m.periodo_id}`,
        delegacionNombre: d ? d.nombre : 'Sin delegación',
      };
    });
  }

  getMetaById(id: number): MetaItem | undefined {
    return this.metas.find((m) => m.id === id);
  }

  createMeta(data: {
    cargo_o_usuario: string;
    descripcion: string;
    ponderacion: number;
    periodo_id: number;
    delegacion_id: number;
    evidencia: string | null;
  }): MetaItem {
    const newMeta: MetaItem = {
      id: this.nextMetaId++,
      cargo_o_usuario: data.cargo_o_usuario,
      descripcion: data.descripcion,
      ponderacion: data.ponderacion,
      periodo_id: data.periodo_id,
      delegacion_id: data.delegacion_id,
      evidencia: data.evidencia,
      deleted_at: null,
    };
    this.metas.push(newMeta);
    this.save();
    return newMeta;
  }

  updateMeta(
    id: number,
    data: Partial<{
      cargo_o_usuario: string;
      descripcion: string;
      ponderacion: number;
      periodo_id: number;
      delegacion_id: number;
      evidencia: string | null;
    }>
  ): MetaItem | undefined {
    const meta = this.getMetaById(id);
    if (!meta) return undefined;
    if (data.cargo_o_usuario !== undefined) meta.cargo_o_usuario = data.cargo_o_usuario;
    if (data.descripcion !== undefined) meta.descripcion = data.descripcion;
    if (data.ponderacion !== undefined) meta.ponderacion = data.ponderacion;
    if (data.periodo_id !== undefined) meta.periodo_id = data.periodo_id;
    if (data.delegacion_id !== undefined) meta.delegacion_id = data.delegacion_id;
    if (data.evidencia !== undefined && data.evidencia !== null) meta.evidencia = data.evidencia;
    this.save();
    return meta;
  }

  updateMetaEvidencia(id: number, evidenciaPath: string | null): boolean {
    const meta = this.getMetaById(id);
    if (!meta) return false;
    if (meta.evidencia && meta.evidencia !== evidenciaPath) {
      if (!meta.evidencias_archivadas) meta.evidencias_archivadas = [];
      if (!meta.evidencias_archivadas.includes(meta.evidencia)) {
        meta.evidencias_archivadas.push(meta.evidencia);
      }
    }
    meta.evidencia = evidenciaPath;
    this.save();
    return true;
  }

  removeMetaEvidencia(id: number): boolean {
    const meta = this.getMetaById(id);
    if (!meta) return false;
    if (meta.evidencia) {
      if (!meta.evidencias_archivadas) meta.evidencias_archivadas = [];
      if (!meta.evidencias_archivadas.includes(meta.evidencia)) {
        meta.evidencias_archivadas.push(meta.evidencia);
      }
    }
    meta.evidencia = null;
    this.save();
    return true;
  }

  archiveMetaEvidencia(id: number): boolean {
    return this.removeMetaEvidencia(id);
  }

  restoreMetaEvidencia(id: number, filePath?: string): boolean {
    const meta = this.getMetaById(id);
    if (!meta || !meta.evidencias_archivadas || meta.evidencias_archivadas.length === 0) return false;
    const target = filePath || meta.evidencias_archivadas[meta.evidencias_archivadas.length - 1];
    meta.evidencias_archivadas = meta.evidencias_archivadas.filter((f) => f !== target);
    meta.evidencia = target;
    this.save();
    return true;
  }

  softDeleteMeta(id: number): boolean {
    const meta = this.getMetaById(id);
    if (!meta) return false;
    meta.deleted_at = new Date().toISOString();
    this.save();
    return true;
  }

  hardDeleteMeta(id: number): boolean {
    const index = this.metas.findIndex((m) => m.id === id);
    if (index === -1) return false;
    this.metas.splice(index, 1);
    this.save();
    return true;
  }

  restoreMeta(id: number): boolean {
    const meta = this.getMetaById(id);
    if (!meta) return false;
    meta.deleted_at = null;
    this.save();
    return true;
  }

  archiveMetasBatch(ids: number[]): number {
    let count = 0;
    const now = new Date().toISOString();
    for (const id of ids) {
      const meta = this.getMetaById(id);
      if (meta && !meta.deleted_at) {
        meta.deleted_at = now;
        count++;
      }
    }
    if (count > 0) this.save();
    return count;
  }

  restoreMetasBatch(ids: number[]): number {
    let count = 0;
    for (const id of ids) {
      const meta = this.getMetaById(id);
      if (meta && meta.deleted_at) {
        meta.deleted_at = null;
        count++;
      }
    }
    if (count > 0) this.save();
    return count;
  }

  hardDeleteMetasBatch(ids: number[]): number {
    const initialLen = this.metas.length;
    this.metas = this.metas.filter((m) => !ids.includes(m.id));
    const count = initialLen - this.metas.length;
    if (count > 0) this.save();
    return count;
  }

  // Password reset
  createPasswordResetCode(userId: number, code: string): PasswordResetCodeItem {
    for (const c of this.resetCodes) {
      if (c.user_id === userId && !c.is_used) {
        c.is_used = true;
      }
    }
    const codeHash = bcrypt.hashSync(code, 8);
    const item: PasswordResetCodeItem = {
      id: this.nextResetCodeId++,
      user_id: userId,
      code_hash: codeHash,
      raw_code: code,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 120 * 1000).toISOString(),
      is_used: false,
      failed_attempts: 0,
    };
    this.resetCodes.push(item);
    this.save();
    return item;
  }

  getActiveResetCode(userId: number): PasswordResetCodeItem | undefined {
    return this.resetCodes
      .filter((c) => c.user_id === userId && !c.is_used)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  }

  getResetCodeById(codeId: number): PasswordResetCodeItem | undefined {
    return this.resetCodes.find((c) => c.id === codeId);
  }

  updateUserPassword(userId: number, newPassword: string): boolean {
    const user = this.getUser(userId);
    if (!user) return false;
    user.passwordHash = bcrypt.hashSync(newPassword, 8);
    this.save();
    return true;
  }

  resetStoreToDefaults() {
    this.seedDefaults();
    this.save();
  }
}

export const store = new Store();
