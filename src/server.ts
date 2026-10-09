import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { store, User } from './models/store.js';

const app = express();
const PORT = 3000;

// Ensure upload directory exists
const uploadDir = path.resolve(process.cwd(), 'media', 'evidencias', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Formato no permitido. Suba solo imágenes JPG o PNG.'));
    }
  },
});

// Configure view engine
app.set('view engine', 'ejs');
app.set('views', path.resolve(process.cwd(), 'views'));

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session setup with proxy trust for iframe environments
app.set('trust proxy', 1);
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'sgr-la-serena-dev-secret-2026',
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
      sameSite: 'none',
      secure: true,
    },
  }) as any
);

// Serve media directory
app.use('/media', express.static(path.resolve(process.cwd(), 'media')));

// Helper for session typing
declare module 'express-session' {
  interface SessionData {
    userId?: number;
    meta_page_size?: number;
    reset_user_id?: number;
    reset_code_id?: number;
    flashMessages?: { tags: 'primary' | 'success' | 'warning' | 'danger' | 'info'; text: string }[];
  }
}

// Flash messages middleware & user context
app.use((req: Request, res: Response, next: NextFunction) => {
  const flash = req.session.flashMessages || [];
  res.locals.messages = [...flash];
  req.session.flashMessages = [];

  // Check URL query parameters for user switching (?u=admin, ?u=funcionario1, etc.)
  const queryUser = req.query.u || req.query.user;
  if (queryUser && typeof queryUser === 'string') {
    const matched = store.getUserByUsername(queryUser.trim());
    if (matched) {
      req.session.userId = matched.id;
    }
  }

  // Ensure an authenticated session exists (default to Admin for instant seamless access)
  if (!req.session.userId) {
    req.session.userId = 1; // Default to 'admin'
  }

  // Add current logged in user to res.locals
  const user = store.getUser(req.session.userId);
  if (user) {
    const delegacion = store.getDelegacion(user.delegacion_id);
    res.locals.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      is_authenticated: true,
      is_superuser: user.is_superuser,
      rol: user.rol,
      delegacion_id: user.delegacion_id,
      perfilusuario: {
        rol: user.rol,
        delegacion: delegacion ? { id: delegacion.id, nombre: delegacion.nombre } : { id: 0, nombre: 'Global' },
      },
    };
    res.locals.perms = {
      mantenedores: {
        add_meta: true,
        change_meta: true,
        delete_meta: true, // Se permite eliminar y archivar metas según pertenencia de delegación
      },
    };
  } else {
    res.locals.user = { is_authenticated: false };
    res.locals.perms = { mantenedores: {} };
  }

  next();
});

function addFlash(req: Request, tags: 'primary' | 'success' | 'warning' | 'danger' | 'info', text: string) {
  if (!req.session.flashMessages) {
    req.session.flashMessages = [];
  }
  req.session.flashMessages.push({ tags, text });
}

// Middleware: Require Admin
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    addFlash(req, 'warning', 'Debe iniciar sesión como Administrador para acceder al panel.');
    return res.redirect('/login?next=/admin/');
  }
  const user = store.getUser(req.session.userId);
  if (!user || (!user.is_superuser && user.rol !== 'ADMIN')) {
    addFlash(req, 'danger', 'Acceso denegado: Solo el Administrador tiene acceso a ver todo el sistema y al panel completo.');
    return res.redirect('/wireframe-front');
  }
  next();
}

// Root redirect
app.get('/', (_req: Request, res: Response) => {
  res.redirect('/wireframe-front');
});

// ==========================================
// PORTAL PÚBLICO CIUDADANO (/sitio-publico)
// ==========================================

const renderSitioPublico = (req: Request, res: Response) => {
  const searchQuery = (req.query.q as string) || '';
  const filterDelegacion = req.query.delegacion ? parseInt(req.query.delegacion as string, 10) : undefined;
  const filterPeriodo = req.query.periodo ? parseInt(req.query.periodo as string, 10) : undefined;

  // Citizens see all active metas matching their filters
  const allMetas = store.getMetas({
    user: null,
    delegacionId: filterDelegacion,
    periodoId: filterPeriodo,
    search: searchQuery,
    includeArchived: false,
  });

  const totalMetasCount = store.getMetas({ user: null, includeArchived: false }).length;
  const pageSize = 10;
  let pageNumber = parseInt((req.query.page as string) || '1', 10);
  const totalPages = Math.max(1, Math.ceil(allMetas.length / pageSize));
  if (isNaN(pageNumber) || pageNumber < 1) pageNumber = 1;
  if (pageNumber > totalPages) pageNumber = totalPages;

  const startIndex = (pageNumber - 1) * pageSize;
  const paginatedMetas = allMetas.slice(startIndex, startIndex + pageSize);

  const pageObj = {
    metas: paginatedMetas,
    number: pageNumber,
    previous_page_number: Math.max(1, pageNumber - 1),
    next_page_number: Math.min(totalPages, pageNumber + 1),
    has_previous: pageNumber > 1,
    has_next: pageNumber < totalPages,
    paginator: {
      count: allMetas.length,
      num_pages: totalPages,
    },
  };

  res.render('public/sitio_publico', {
    page_obj: pageObj,
    delegaciones: store.getDelegaciones().filter((d) => d.activa),
    periodos: store.getPeriodos(),
    selectedDelegacion: filterDelegacion || '',
    selectedPeriodo: filterPeriodo || '',
    searchQuery,
    totalMetasCount,
  });
};

app.get('/sitio-publico', renderSitioPublico);

// ==========================================
// WIREFRAME FRONT (PORTAL PÚBLICO O ÁREA INTERNA SEGÚN SESIÓN)
// ==========================================

app.get('/wireframe-front', (req: Request, res: Response) => {
  const currentUser: User | null = req.session.userId ? store.getUser(req.session.userId) || null : null;

  // Si NO está autenticado, muestra el Portal Ciudadano con lógica pública transparente y clara
  if (!currentUser) {
    return renderSitioPublico(req, res);
  }

  // Si ESTÁ autenticado, muestra el Área de Trabajo con scoping estricto por delegación
  const rawSize = req.query.page_size as string;
  if (rawSize && ['5', '15', '30'].includes(rawSize)) {
    req.session.meta_page_size = parseInt(rawSize, 10);
  }
  const pageSize = req.session.meta_page_size || 5;

  const searchQuery = (req.query.q as string) || '';
  const filterDelegacion = (currentUser.is_superuser || currentUser.rol === 'ADMIN') && req.query.delegacion
    ? parseInt(req.query.delegacion as string, 10)
    : undefined;
  const filterPeriodo = req.query.periodo ? parseInt(req.query.periodo as string, 10) : undefined;
  const showArchived = req.query.status === 'archivadas';

  // Fetch filtered metas with strict scoping
  const allMetas = store.getMetas({
    user: currentUser,
    delegacionId: filterDelegacion,
    periodoId: filterPeriodo,
    search: searchQuery,
    includeArchived: showArchived,
  });

  // Calculate total ponderación for active metas in scope
  const activeScopedMetas = store.getMetas({
    user: currentUser,
    delegacionId: filterDelegacion,
    periodoId: filterPeriodo,
    search: '',
    includeArchived: false,
  });
  const totalPonderacion = activeScopedMetas.reduce((acc, m) => acc + (m.ponderacion || 0), 0);

  const totalCount = allMetas.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  let pageNumber = parseInt((req.query.page as string) || '1', 10);
  if (isNaN(pageNumber) || pageNumber < 1) pageNumber = 1;
  if (pageNumber > totalPages) pageNumber = totalPages;

  const startIndex = (pageNumber - 1) * pageSize;
  const paginatedMetas = allMetas.slice(startIndex, startIndex + pageSize);

  const pageObj = {
    metas: paginatedMetas,
    number: pageNumber,
    previous_page_number: pageNumber > 1 ? pageNumber - 1 : 1,
    next_page_number: pageNumber < totalPages ? pageNumber + 1 : totalPages,
    has_previous: pageNumber > 1,
    has_next: pageNumber < totalPages,
    paginator: {
      count: totalCount,
      num_pages: totalPages,
    },
  };

  res.render('metas/registro_meta', {
    page_obj: pageObj,
    page_size: pageSize,
    open_modal: false,
    form: {
      cargo_o_usuario: '',
      periodo: store.getPeriodos().find((p) => p.activo)?.id || 1,
      delegacion: currentUser.delegacion_id,
      ponderacion: '',
      descripcion: '',
      errors: {},
    },
    object: null,
    periodos: store.getPeriodos(),
    delegaciones: store.getDelegaciones(),
    selectedDelegacion: filterDelegacion || '',
    selectedPeriodo: filterPeriodo || '',
    searchQuery,
    showArchived,
    totalPonderacion,
  });
});

// Meta Create GET & POST
app.get('/wireframe-front/meta/nueva/', (req: Request, res: Response) => {
  if (!req.session.userId) {
    addFlash(req, 'warning', 'Debe iniciar sesión para registrar una meta.');
    return res.redirect('/login?next=/wireframe-front/meta/nueva/');
  }

  const currentUser = store.getUser(req.session.userId)!;
  const pageSize = req.session.meta_page_size || 5;
  const allMetas = store.getMetas({ user: currentUser });
  const activePeriodos = store.getPeriodos().filter((p) => p.activo);

  const pageObj = {
    metas: allMetas.slice(0, pageSize),
    number: 1,
    previous_page_number: 1,
    next_page_number: 1,
    has_previous: false,
    has_next: allMetas.length > pageSize,
    paginator: {
      count: allMetas.length,
      num_pages: Math.max(1, Math.ceil(allMetas.length / pageSize)),
    },
  };

  res.render('metas/registro_meta', {
    page_obj: pageObj,
    page_size: pageSize,
    open_modal: true,
    form: {
      cargo_o_usuario: '',
      periodo: activePeriodos[0]?.id || 1,
      delegacion: currentUser.delegacion_id,
      ponderacion: '',
      descripcion: '',
      errors: {},
    },
    object: null,
    periodos: store.getPeriodos(),
    delegaciones: store.getDelegaciones(),
    selectedDelegacion: '',
    selectedPeriodo: '',
    searchQuery: '',
    showArchived: false,
    totalPonderacion: allMetas.reduce((acc, m) => acc + (m.ponderacion || 0), 0),
  });
});

// Helper multer middleware
function uploadMiddleware(fieldName: string) {
  const single = upload.single(fieldName);
  return (req: Request, res: Response, next: NextFunction) => {
    (single as any)(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          addFlash(req, 'danger', 'La imagen no puede superar los 2 MB.');
        } else {
          addFlash(req, 'danger', `Error al subir archivo: ${err.message}`);
        }
        return res.redirect('back');
      } else if (err) {
        addFlash(req, 'danger', err.message || 'Error en el archivo subido.');
        return res.redirect('back');
      }
      next();
    });
  };
}

const handleCreateMeta = (req: Request, res: Response) => {
  if (!req.session.userId) {
    addFlash(req, 'danger', 'Sesión expirada.');
    return res.redirect('/login');
  }

  const currentUser = store.getUser(req.session.userId)!;
  const { cargo_o_usuario, periodo, delegacion, ponderacion, descripcion } = req.body;
  const numPonderacion = parseInt(ponderacion, 10);
  const errors: Record<string, string> = {};

  if (!cargo_o_usuario || !cargo_o_usuario.trim()) {
    errors.cargo_o_usuario = 'Este campo es requerido.';
  }
  if (!periodo) {
    errors.periodo = 'Seleccione un período válido.';
  }
  if (isNaN(numPonderacion) || numPonderacion < 1 || numPonderacion > 100) {
    errors.ponderacion = 'La ponderación debe estar entre 1% y 100%.';
  }
  if (!descripcion || !descripcion.trim()) {
    errors.descripcion = 'Este campo es requerido.';
  }

  // Delegación assignment:
  // Non-admins CANNOT assign a meta to another delegation. It is strictly forced to their own delegation!
  let targetDelegacionId = currentUser.delegacion_id;
  if (currentUser.is_superuser || currentUser.rol === 'ADMIN') {
    if (delegacion) {
      targetDelegacionId = parseInt(delegacion, 10);
    }
  }

  if (Object.keys(errors).length > 0) {
    const pageSize = req.session.meta_page_size || 5;
    const allMetas = store.getMetas({ user: currentUser });
    const pageObj = {
      metas: allMetas.slice(0, pageSize),
      number: 1,
      previous_page_number: 1,
      next_page_number: 1,
      has_previous: false,
      has_next: allMetas.length > pageSize,
      paginator: { count: allMetas.length, num_pages: 1 },
    };
    return res.render('metas/registro_meta', {
      page_obj: pageObj,
      page_size: pageSize,
      open_modal: true,
      form: {
        cargo_o_usuario,
        periodo,
        delegacion: targetDelegacionId,
        ponderacion,
        descripcion,
        errors,
      },
      object: null,
      periodos: store.getPeriodos(),
      delegaciones: store.getDelegaciones(),
      selectedDelegacion: '',
      selectedPeriodo: '',
      searchQuery: '',
      showArchived: false,
      totalPonderacion: allMetas.reduce((acc, m) => acc + (m.ponderacion || 0), 0),
    });
  }

  const evidenciaPath = req.file ? `/media/evidencias/uploads/${req.file.filename}` : null;

  store.createMeta({
    cargo_o_usuario: cargo_o_usuario.trim(),
    descripcion: descripcion.trim(),
    ponderacion: numPonderacion,
    periodo_id: parseInt(periodo, 10),
    delegacion_id: targetDelegacionId,
    evidencia: evidenciaPath,
  });

  addFlash(req, 'success', 'Meta registrada correctamente.');
  res.redirect('/wireframe-front');
};

app.post('/wireframe-front/meta/nueva/', uploadMiddleware('evidencia') as any, handleCreateMeta as any);

// Meta Update GET & POST
app.get('/wireframe-front/meta/:pk/editar/', (req: Request, res: Response) => {
  if (!req.session.userId) {
    addFlash(req, 'warning', 'Debe iniciar sesión para modificar una meta.');
    return res.redirect('/login');
  }

  const metaId = parseInt(req.params.pk, 10);
  const meta = store.getMetaById(metaId);
  if (!meta || meta.deleted_at) {
    addFlash(req, 'danger', 'La meta especificada no existe o está archivada.');
    return res.redirect('/wireframe-front');
  }

  const currentUser = store.getUser(req.session.userId)!;

  // Strict delegation authorization check:
  // Non-admins CANNOT view or edit metas from another delegation.
  if (!currentUser.is_superuser && currentUser.rol !== 'ADMIN' && meta.delegacion_id !== currentUser.delegacion_id) {
    addFlash(req, 'danger', 'Acceso denegado: No puedes visualizar ni modificar metas que no correspondan a tu delegación.');
    return res.redirect('/wireframe-front');
  }

  const pageSize = req.session.meta_page_size || 5;
  const allMetas = store.getMetas({ user: currentUser });
  const pageObj = {
    metas: allMetas.slice(0, pageSize),
    number: 1,
    previous_page_number: 1,
    next_page_number: 1,
    has_previous: false,
    has_next: allMetas.length > pageSize,
    paginator: { count: allMetas.length, num_pages: Math.max(1, Math.ceil(allMetas.length / pageSize)) },
  };

  res.render('metas/registro_meta', {
    page_obj: pageObj,
    page_size: pageSize,
    open_modal: true,
    form: {
      cargo_o_usuario: meta.cargo_o_usuario,
      periodo: meta.periodo_id,
      delegacion: meta.delegacion_id,
      ponderacion: meta.ponderacion,
      descripcion: meta.descripcion,
      errors: {},
    },
    object: meta,
    periodos: store.getPeriodos(),
    delegaciones: store.getDelegaciones(),
    selectedDelegacion: '',
    selectedPeriodo: '',
    searchQuery: '',
    showArchived: false,
    totalPonderacion: allMetas.reduce((acc, m) => acc + (m.ponderacion || 0), 0),
  });
});

const handleUpdateMeta = (req: Request, res: Response) => {
  if (!req.session.userId) {
    addFlash(req, 'danger', 'Sesión expirada.');
    return res.redirect('/login');
  }

  const metaId = parseInt(req.params.pk, 10);
  const meta = store.getMetaById(metaId);
  if (!meta || meta.deleted_at) {
    addFlash(req, 'danger', 'Meta no encontrada.');
    return res.redirect('/wireframe-front');
  }

  const currentUser = store.getUser(req.session.userId)!;

  // Strict delegation authorization check
  if (!currentUser.is_superuser && currentUser.rol !== 'ADMIN' && meta.delegacion_id !== currentUser.delegacion_id) {
    addFlash(req, 'danger', 'Acceso denegado: No tienes permisos para modificar metas de otra delegación.');
    return res.redirect('/wireframe-front');
  }

  const { cargo_o_usuario, periodo, delegacion, ponderacion, descripcion } = req.body;
  const numPonderacion = parseInt(ponderacion, 10);
  const errors: Record<string, string> = {};

  if (!cargo_o_usuario || !cargo_o_usuario.trim()) {
    errors.cargo_o_usuario = 'Este campo es requerido.';
  }
  if (isNaN(numPonderacion) || numPonderacion < 1 || numPonderacion > 100) {
    errors.ponderacion = 'La ponderación debe estar entre 1% y 100%.';
  }
  if (!descripcion || !descripcion.trim()) {
    errors.descripcion = 'Este campo es requerido.';
  }

  if (Object.keys(errors).length > 0) {
    const pageSize = req.session.meta_page_size || 5;
    const allMetas = store.getMetas({ user: currentUser });
    const pageObj = {
      metas: allMetas.slice(0, pageSize),
      number: 1,
      previous_page_number: 1,
      next_page_number: 1,
      has_previous: false,
      has_next: allMetas.length > pageSize,
      paginator: { count: allMetas.length, num_pages: 1 },
    };
    return res.render('metas/registro_meta', {
      page_obj: pageObj,
      page_size: pageSize,
      open_modal: true,
      form: {
        cargo_o_usuario,
        periodo,
        delegacion: meta.delegacion_id,
        ponderacion,
        descripcion,
        errors,
      },
      object: meta,
      periodos: store.getPeriodos(),
      delegaciones: store.getDelegaciones(),
      selectedDelegacion: '',
      selectedPeriodo: '',
      searchQuery: '',
      showArchived: false,
      totalPonderacion: allMetas.reduce((acc, m) => acc + (m.ponderacion || 0), 0),
    });
  }

  const evidenciaPath = req.file ? `/media/evidencias/uploads/${req.file.filename}` : undefined;
  
  // Only admin can move a meta between delegations
  const updatedDelegacionId = (currentUser.is_superuser || currentUser.rol === 'ADMIN') && delegacion
    ? parseInt(delegacion, 10)
    : meta.delegacion_id;

  store.updateMeta(metaId, {
    cargo_o_usuario: cargo_o_usuario.trim(),
    descripcion: descripcion.trim(),
    ponderacion: numPonderacion,
    periodo_id: parseInt(periodo, 10),
    delegacion_id: updatedDelegacionId,
    evidencia: evidenciaPath,
  });

  addFlash(req, 'success', 'Meta actualizada correctamente.');
  res.redirect('/wireframe-front');
};

app.post('/wireframe-front/meta/:pk/editar/', uploadMiddleware('evidencia') as any, handleUpdateMeta as any);

// Meta Delete (Archive) with Strict Delegation Check
app.post('/wireframe-front/meta/:pk/eliminar/', (req: Request, res: Response) => {
  if (!req.session.userId) {
    addFlash(req, 'danger', 'Debe iniciar sesión para archivar una meta.');
    return res.redirect('/login');
  }

  const metaId = parseInt(req.params.pk, 10);
  const meta = store.getMetaById(metaId);
  if (!meta) {
    addFlash(req, 'danger', 'La meta no existe.');
    return res.redirect('/wireframe-front');
  }

  const currentUser = store.getUser(req.session.userId)!;

  // Strict check: Non-admins CANNOT archive or delete metas of other delegations!
  if (!currentUser.is_superuser && currentUser.rol !== 'ADMIN' && meta.delegacion_id !== currentUser.delegacion_id) {
    addFlash(req, 'danger', 'Acceso denegado: No tienes autorización para archivar ni eliminar metas de otra delegación.');
    return res.redirect('/wireframe-front');
  }

  const success = store.softDeleteMeta(metaId);
  if (success) {
    addFlash(req, 'success', 'Meta archivada correctamente.');
  } else {
    addFlash(req, 'danger', 'Error al archivar la meta.');
  }
  res.redirect('/wireframe-front');
});

// Meta Hard Delete (Eliminar definitivamente) with Strict Delegation Check
app.post('/wireframe-front/meta/:pk/eliminar-definitivo/', (req: Request, res: Response) => {
  if (!req.session.userId) {
    addFlash(req, 'danger', 'Debe iniciar sesión para eliminar una meta.');
    return res.redirect('/login');
  }

  const metaId = parseInt(req.params.pk, 10);
  const meta = store.getMetaById(metaId);
  if (!meta) {
    addFlash(req, 'danger', 'La meta no existe.');
    return res.redirect('/wireframe-front');
  }

  const currentUser = store.getUser(req.session.userId)!;

  // Strict check: Non-admins CANNOT delete metas of other delegations!
  if (!currentUser.is_superuser && currentUser.rol !== 'ADMIN' && meta.delegacion_id !== currentUser.delegacion_id) {
    addFlash(req, 'danger', 'Acceso denegado: No tienes autorización para eliminar metas de otra delegación.');
    return res.redirect('/wireframe-front');
  }

  const success = store.hardDeleteMeta(metaId);
  if (success) {
    addFlash(req, 'success', 'Meta eliminada permanentemente de la base de datos.');
  } else {
    addFlash(req, 'danger', 'Error al eliminar la meta.');
  }
  res.redirect('/wireframe-front');
});

// Meta Restore (Unarchive) with Strict Delegation Check
app.post('/wireframe-front/meta/:pk/restaurar/', (req: Request, res: Response) => {
  if (!req.session.userId) {
    addFlash(req, 'danger', 'Debe iniciar sesión para restaurar una meta.');
    return res.redirect('/login');
  }

  const metaId = parseInt(req.params.pk, 10);
  const meta = store.getMetaById(metaId);
  if (!meta) {
    addFlash(req, 'danger', 'La meta no existe.');
    return res.redirect('/wireframe-front?status=archivadas');
  }

  const currentUser = store.getUser(req.session.userId)!;

  // Strict check: Non-admins CANNOT restore metas of other delegations!
  if (!currentUser.is_superuser && currentUser.rol !== 'ADMIN' && meta.delegacion_id !== currentUser.delegacion_id) {
    addFlash(req, 'danger', 'Acceso denegado: No tienes autorización para restaurar metas de otra delegación.');
    return res.redirect('/wireframe-front?status=archivadas');
  }

  const success = store.restoreMeta(metaId);
  if (success) {
    addFlash(req, 'success', 'Meta restaurada con éxito.');
  } else {
    addFlash(req, 'danger', 'Error al restaurar la meta.');
  }
  res.redirect('/wireframe-front?status=archivadas');
});

// Wireframe-front: Acciones en Lote (Batch Actions: archivar, restaurar, eliminar)
app.post('/wireframe-front/metas/lote/', (req: Request, res: Response) => {
  if (!req.session.userId) {
    addFlash(req, 'danger', 'Debe iniciar sesión para realizar acciones en lote.');
    return res.redirect('/login');
  }

  const currentUser = store.getUser(req.session.userId)!;
  const { meta_ids, action } = req.body;
  let ids: number[] = [];
  if (Array.isArray(meta_ids)) {
    ids = meta_ids.map((id: string) => parseInt(id, 10));
  } else if (typeof meta_ids === 'string') {
    ids = [parseInt(meta_ids, 10)];
  }

  if (ids.length === 0) {
    addFlash(req, 'warning', 'No seleccionaste ninguna meta.');
    return res.redirect('/wireframe-front');
  }

  // Filter allowed IDs based on delegation scoping
  const allowedIds = ids.filter((id) => {
    const meta = store.getMetaById(id);
    if (!meta) return false;
    if (currentUser.is_superuser || currentUser.rol === 'ADMIN') return true;
    return meta.delegacion_id === currentUser.delegacion_id;
  });

  if (allowedIds.length === 0) {
    addFlash(req, 'danger', 'Acceso denegado: No tienes autorización sobre las metas seleccionadas.');
    return res.redirect('/wireframe-front');
  }

  if (action === 'archivar') {
    const count = store.archiveMetasBatch(allowedIds);
    addFlash(req, 'success', `${count} meta(s) archivada(s) correctamente.`);
    res.redirect('/wireframe-front');
  } else if (action === 'restaurar') {
    const count = store.restoreMetasBatch(allowedIds);
    addFlash(req, 'success', `${count} meta(s) restaurada(s) correctamente.`);
    res.redirect('/wireframe-front?status=archivadas');
  } else if (action === 'eliminar') {
    const count = store.hardDeleteMetasBatch(allowedIds);
    addFlash(req, 'success', `${count} meta(s) eliminada(s) permanentemente.`);
    res.redirect('/wireframe-front');
  } else {
    addFlash(req, 'warning', 'Acción no válida.');
    res.redirect('/wireframe-front');
  }
});

// Meta Evidencia: Editar / Subir nueva evidencia
app.post('/wireframe-front/meta/:pk/evidencia/editar/', uploadMiddleware('evidencia') as any, (req: Request, res: Response) => {
  if (!req.session.userId) {
    addFlash(req, 'danger', 'Debe iniciar sesión para gestionar evidencias.');
    return res.redirect('/login');
  }
  const metaId = parseInt(req.params.pk, 10);
  const meta = store.getMetaById(metaId);
  if (!meta) {
    addFlash(req, 'danger', 'La meta no existe.');
    return res.redirect('/wireframe-front');
  }
  const currentUser = store.getUser(req.session.userId)!;
  if (!currentUser.is_superuser && currentUser.rol !== 'ADMIN' && meta.delegacion_id !== currentUser.delegacion_id) {
    addFlash(req, 'danger', 'Acceso denegado: No tienes autorización para modificar evidencias de otra delegación.');
    return res.redirect('/wireframe-front');
  }
  if (!req.file) {
    addFlash(req, 'warning', 'No seleccionaste un archivo.');
    return res.redirect('/wireframe-front');
  }
  const evidenciaPath = `/media/evidencias/uploads/${req.file.filename}`;
  store.updateMetaEvidencia(metaId, evidenciaPath);
  addFlash(req, 'success', 'Evidencia actualizada exitosamente.');
  res.redirect('/wireframe-front');
});

// Meta Evidencia: Archivar / Quitar evidencia
app.post('/wireframe-front/meta/:pk/evidencia/archivar/', (req: Request, res: Response) => {
  if (!req.session.userId) {
    addFlash(req, 'danger', 'Debe iniciar sesión para archivar evidencias.');
    return res.redirect('/login');
  }
  const metaId = parseInt(req.params.pk, 10);
  const meta = store.getMetaById(metaId);
  if (!meta) {
    addFlash(req, 'danger', 'La meta no existe.');
    return res.redirect('/wireframe-front');
  }
  const currentUser = store.getUser(req.session.userId)!;
  if (!currentUser.is_superuser && currentUser.rol !== 'ADMIN' && meta.delegacion_id !== currentUser.delegacion_id) {
    addFlash(req, 'danger', 'Acceso denegado: No tienes autorización para archivar evidencias de otra delegación.');
    return res.redirect('/wireframe-front');
  }
  store.removeMetaEvidencia(metaId);
  addFlash(req, 'success', 'Evidencia archivada y retirada de la meta correctamente.');
  res.redirect('/wireframe-front');
});

// Meta Evidencia: Restaurar evidencia previamente archivada
app.post('/wireframe-front/meta/:pk/evidencia/restaurar/', (req: Request, res: Response) => {
  if (!req.session.userId) {
    addFlash(req, 'danger', 'Debe iniciar sesión para gestionar evidencias.');
    return res.redirect('/login');
  }
  const metaId = parseInt(req.params.pk, 10);
  const meta = store.getMetaById(metaId);
  if (!meta) {
    addFlash(req, 'danger', 'La meta no existe.');
    return res.redirect('/wireframe-front');
  }
  const currentUser = store.getUser(req.session.userId)!;
  if (!currentUser.is_superuser && currentUser.rol !== 'ADMIN' && meta.delegacion_id !== currentUser.delegacion_id) {
    addFlash(req, 'danger', 'Acceso denegado: No tienes autorización para modificar evidencias de otra delegación.');
    return res.redirect('/wireframe-front');
  }
  const restored = store.restoreMetaEvidencia(metaId);
  if (restored) {
    addFlash(req, 'success', 'Evidencia archivada restaurada exitosamente.');
  } else {
    addFlash(req, 'warning', 'No hay evidencia archivada para restaurar.');
  }
  res.redirect('/wireframe-front');
});

// ==========================================
// CATALOGO DE SERVICIOS
// ==========================================

app.get('/catalogo-servicios', (_req: Request, res: Response) => {
  const servicios = store.getServicios();
  res.render('servicios/catalogo', { servicios });
});

// ==========================================
// AUTH: LOGIN & LOGOUT
// ==========================================

const showLoginPage = (req: Request, res: Response) => {
  res.render('registration/login', {
    form: { errors: false },
    next: req.query.next || '/wireframe-front',
  });
};

app.get('/login', showLoginPage);
app.get('/accounts/login/', showLoginPage);

const handleLogin = (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.render('registration/login', {
      form: { errors: true },
      next: req.body.next || '/wireframe-front',
    });
  }

  const user = store.getUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.render('registration/login', {
      form: { errors: true },
      next: req.body.next || '/wireframe-front',
    });
  }

  req.session.userId = user.id;
  const redirectUrl = (req.body.next as string) || (req.query.next as string) || '/wireframe-front';
  res.redirect(redirectUrl);
};

app.post('/login', handleLogin);
app.post('/accounts/login/', handleLogin);

const handleLogout = (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.redirect('/wireframe-front');
  });
};

app.get('/logout', handleLogout);
app.post('/logout', handleLogout);
app.post('/accounts/logout/', handleLogout);

// ==========================================
// PASSWORD RESET WORKFLOW (CLASE 6)
// ==========================================

app.get('/password-reset/', (_req: Request, res: Response) => {
  res.render('registration/password_reset_request', {
    form: { email: '' },
  });
});

app.post('/password-reset/', (req: Request, res: Response) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const user = store.getUserByEmail(email);

  if (user) {
    const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
    store.createPasswordResetCode(user.id, randomCode);

    req.session.reset_user_id = user.id;

    console.log('\n================== [EMAIL CONSOLE] ==================');
    console.log(`Para: ${email}`);
    console.log(`Asunto: Código de Recuperación - SGR La Serena`);
    console.log(`Hola ${user.username}, tu código temporal de recuperación es: ${randomCode}`);
    console.log(`Válido durante 120 segundos.`);
    console.log('=====================================================\n');

    addFlash(
      req,
      'info',
      `Se ha generado un código de 6 dígitos. Para pruebas rápidas: ${randomCode} (válido 120s)`
    );
  } else {
    addFlash(
      req,
      'info',
      'Si el correo corresponde a una cuenta registrada, se ha enviado un código temporal.'
    );
  }

  res.redirect('/password-reset/verify/');
});

app.get('/password-reset/verify/', (req: Request, res: Response) => {
  const userId = req.session.reset_user_id;
  if (!userId) {
    addFlash(req, 'danger', 'Sesión de recuperación inválida o expirada.');
    return res.redirect('/password-reset/');
  }

  const resetObj = store.getActiveResetCode(userId);
  let secondsRemaining = 120;
  if (resetObj) {
    const remaining = Math.max(0, Math.floor((new Date(resetObj.expires_at).getTime() - Date.now()) / 1000));
    secondsRemaining = remaining;
  }

  res.render('registration/password_reset_verify', {
    form: { code: '' },
    secondsRemaining,
    demoCode: resetObj?.raw_code || '',
  });
});

app.post('/password-reset/verify/', (req: Request, res: Response) => {
  const userId = req.session.reset_user_id;
  if (!userId) {
    addFlash(req, 'danger', 'Sesión de recuperación inválida o expirada.');
    return res.redirect('/password-reset/');
  }

  const inputCode = (req.body.code || '').trim();
  const resetObj = store.getActiveResetCode(userId);

  if (!resetObj) {
    addFlash(req, 'danger', 'No existe un código activo.');
    return res.redirect('/password-reset/');
  }

  // Expiration check
  if (Date.now() > new Date(resetObj.expires_at).getTime()) {
    addFlash(req, 'danger', 'El código ha expirado (más de 120 segundos).');
    return res.redirect('/password-reset/');
  }

  // Failed attempts check
  if (resetObj.failed_attempts >= 5) {
    addFlash(req, 'danger', 'Ha superado el número máximo de intentos permitidos (5).');
    return res.redirect('/password-reset/');
  }

  const isValid = bcrypt.compareSync(inputCode, resetObj.code_hash);
  if (!isValid) {
    resetObj.failed_attempts += 1;
    if (resetObj.failed_attempts >= 5) {
      addFlash(req, 'danger', 'Ha superado el número máximo de intentos.');
      return res.redirect('/password-reset/');
    }
    const remaining = 5 - resetObj.failed_attempts;
    addFlash(req, 'danger', `Código incorrecto. Intentos restantes: ${remaining}`);
    const secondsRemaining = Math.max(0, Math.floor((new Date(resetObj.expires_at).getTime() - Date.now()) / 1000));
    return res.render('registration/password_reset_verify', {
      form: { code: inputCode },
      secondsRemaining,
      demoCode: resetObj.raw_code || '',
    });
  }

  req.session.reset_code_id = resetObj.id;
  addFlash(req, 'success', 'Código verificado correctamente.');
  res.redirect('/password-reset/confirm/');
});

app.get('/password-reset/confirm/', (req: Request, res: Response) => {
  const codeId = req.session.reset_code_id;
  if (!codeId) {
    addFlash(req, 'danger', 'Proceso no autorizado.');
    return res.redirect('/password-reset/');
  }

  res.render('registration/password_reset_confirm', {
    form: { errors: [] },
  });
});

app.post('/password-reset/confirm/', (req: Request, res: Response) => {
  const codeId = req.session.reset_code_id;
  if (!codeId) {
    addFlash(req, 'danger', 'Proceso no autorizado.');
    return res.redirect('/password-reset/');
  }

  const resetObj = store.getResetCodeById(codeId);
  if (!resetObj || resetObj.is_used) {
    addFlash(req, 'danger', 'Código no válido o ya utilizado.');
    return res.redirect('/password-reset/');
  }

  const { new_password, confirm_password } = req.body;
  const errors: string[] = [];

  if (!new_password || new_password.length < 8) {
    errors.push('La contraseña debe tener al menos 8 caracteres.');
  }
  if (new_password !== confirm_password) {
    errors.push('Las contraseñas no coinciden.');
  }

  if (errors.length > 0) {
    return res.render('registration/password_reset_confirm', {
      form: { errors },
    });
  }

  store.updateUserPassword(resetObj.user_id, new_password);
  resetObj.is_used = true;

  delete req.session.reset_user_id;
  delete req.session.reset_code_id;

  addFlash(req, 'success', '¡Contraseña actualizada con éxito! Ya puede iniciar sesión.');
  res.redirect('/login');
});

// ==========================================
// ADMIN PANEL OVERVIEW & MANAGEMENT (SOLO ADMINISTRADOR)
// ==========================================

app.get(['/admin', '/admin/'], requireAdmin, (_req: Request, res: Response) => {
  const delegaciones = store.getDelegaciones();
  const periodos = store.getPeriodos();
  const servicios = store.getServicios();
  const users = store.users.map((u) => ({
    ...u,
    delegacionNombre: store.getDelegacion(u.delegacion_id)?.nombre || 'Sin Delegación',
  }));
  const metas = store.metas.map((m) => ({
    ...m,
    delegacionNombre: store.getDelegacion(m.delegacion_id)?.nombre || 'Sin Delegación',
    periodoLabel: store.getPeriodo(m.periodo_id)?.label || `ID ${m.periodo_id}`,
  }));

  res.render('admin/index', {
    delegaciones,
    periodos,
    servicios,
    users,
    metas,
  });
});

// Admin: Toggle Delegacion
app.post('/admin/delegacion/:id/toggle/', requireAdmin, (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const d = store.getDelegacion(id);
  if (d) {
    store.updateDelegacion(id, { activa: !d.activa });
    addFlash(req, 'success', `Delegación "${d.nombre}" actualizada.`);
  }
  res.redirect('/admin/');
});

// Admin: Nueva Delegacion
app.post('/admin/delegacion/nueva/', requireAdmin, (req: Request, res: Response) => {
  const { nombre } = req.body;
  if (nombre && nombre.trim()) {
    store.createDelegacion(nombre.trim(), true);
    addFlash(req, 'success', 'Delegación agregada exitosamente.');
  }
  res.redirect('/admin/');
});

// Admin: Toggle Periodo
app.post('/admin/periodo/:id/toggle/', requireAdmin, (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const p = store.getPeriodo(id);
  if (p) {
    store.updatePeriodo(id, { activo: !p.activo });
    addFlash(req, 'success', `Período "${p.label}" actualizado.`);
  }
  res.redirect('/admin/');
});

// Admin: Nuevo Periodo
app.post('/admin/periodo/nuevo/', requireAdmin, (req: Request, res: Response) => {
  const { fecha_inicio, fecha_fin, dias_computables } = req.body;
  if (fecha_inicio && fecha_fin && dias_computables) {
    store.createPeriodo({
      fecha_inicio,
      fecha_fin,
      dias_computables: parseInt(dias_computables, 10),
      activo: true,
    });
    addFlash(req, 'success', 'Nuevo período creado correctamente.');
  }
  res.redirect('/admin/');
});

// Admin: Toggle Servicio
app.post('/admin/servicio/:id/toggle/', requireAdmin, (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const s = store.getServicios().find((item) => item.id === id);
  if (s) {
    store.updateServicio(id, { activo: !s.activo });
    addFlash(req, 'success', `Servicio "${s.nombre_servicio}" actualizado.`);
  }
  res.redirect('/admin/');
});

// Admin: Nuevo Servicio
app.post('/admin/servicio/nuevo/', requireAdmin, (req: Request, res: Response) => {
  const { nombre_servicio, categoria } = req.body;
  if (nombre_servicio && categoria) {
    store.createServicio(nombre_servicio.trim(), categoria.trim(), true);
    addFlash(req, 'success', 'Servicio incorporado al catálogo.');
  }
  res.redirect('/admin/');
});

// Admin: Nuevo Usuario
app.post('/admin/usuario/nuevo/', requireAdmin, (req: Request, res: Response) => {
  const { username, email, password, delegacion_id, rol } = req.body;
  if (!username || !email || !password || !delegacion_id || !rol) {
    addFlash(req, 'danger', 'Todos los campos son requeridos para crear un usuario.');
    return res.redirect('/admin/');
  }

  const result = store.createUser({
    username: username.trim(),
    email: email.trim().toLowerCase(),
    password,
    delegacion_id: parseInt(delegacion_id, 10),
    rol,
    is_superuser: rol === 'ADMIN',
  });

  if (result.success) {
    addFlash(req, 'success', `Usuario ${username} creado con éxito.`);
  } else {
    addFlash(req, 'danger', result.error || 'Error al crear usuario.');
  }
  res.redirect('/admin/');
});

// Admin: Nueva Meta
app.post('/admin/meta/nueva/', requireAdmin, uploadMiddleware('evidencia') as any, (req: Request, res: Response) => {
  const { cargo_o_usuario, periodo_id, delegacion_id, ponderacion, descripcion } = req.body;
  const numPonderacion = parseInt(ponderacion, 10);

  if (!cargo_o_usuario || !periodo_id || !delegacion_id || isNaN(numPonderacion) || !descripcion) {
    addFlash(req, 'danger', 'Todos los campos son requeridos para crear la meta.');
    return res.redirect('/admin/');
  }

  const evidenciaPath = req.file ? `/media/evidencias/uploads/${req.file.filename}` : null;

  store.createMeta({
    cargo_o_usuario: cargo_o_usuario.trim(),
    descripcion: descripcion.trim(),
    ponderacion: numPonderacion,
    periodo_id: parseInt(periodo_id, 10),
    delegacion_id: parseInt(delegacion_id, 10),
    evidencia: evidenciaPath,
  });

  addFlash(req, 'success', 'Meta creada correctamente desde el panel de administración.');
  res.redirect('/admin/');
});

// Admin: Editar Meta
app.post('/admin/meta/:pk/editar/', requireAdmin, uploadMiddleware('evidencia') as any, (req: Request, res: Response) => {
  const metaId = parseInt(req.params.pk, 10);
  const meta = store.getMetaById(metaId);
  if (!meta) {
    addFlash(req, 'danger', 'La meta no existe.');
    return res.redirect('/admin/');
  }

  const { cargo_o_usuario, periodo_id, delegacion_id, ponderacion, descripcion } = req.body;
  const numPonderacion = parseInt(ponderacion, 10);

  const evidenciaPath = req.file ? `/media/evidencias/uploads/${req.file.filename}` : undefined;

  store.updateMeta(metaId, {
    cargo_o_usuario: cargo_o_usuario ? cargo_o_usuario.trim() : undefined,
    descripcion: descripcion ? descripcion.trim() : undefined,
    ponderacion: isNaN(numPonderacion) ? undefined : numPonderacion,
    periodo_id: periodo_id ? parseInt(periodo_id, 10) : undefined,
    delegacion_id: delegacion_id ? parseInt(delegacion_id, 10) : undefined,
    evidencia: evidenciaPath,
  });

  addFlash(req, 'success', `Meta #${metaId} actualizada correctamente.`);
  res.redirect('/admin/');
});

// Admin: Archivar Meta individual
app.post('/admin/meta/:pk/archivar/', requireAdmin, (req: Request, res: Response) => {
  const metaId = parseInt(req.params.pk, 10);
  const success = store.softDeleteMeta(metaId);
  if (success) {
    addFlash(req, 'success', `Meta #${metaId} archivada.`);
  } else {
    addFlash(req, 'danger', 'Error al archivar la meta.');
  }
  res.redirect('/admin/');
});

// Admin: Restaurar Meta individual
app.post('/admin/meta/:pk/restaurar/', requireAdmin, (req: Request, res: Response) => {
  const metaId = parseInt(req.params.pk, 10);
  const success = store.restoreMeta(metaId);
  if (success) {
    addFlash(req, 'success', `Meta #${metaId} restaurada exitosamente.`);
  } else {
    addFlash(req, 'danger', 'Error al restaurar la meta.');
  }
  res.redirect('/admin/');
});

// Admin: Eliminar definitivamente Meta individual
app.post('/admin/meta/:pk/eliminar/', requireAdmin, (req: Request, res: Response) => {
  const metaId = parseInt(req.params.pk, 10);
  const success = store.hardDeleteMeta(metaId);
  if (success) {
    addFlash(req, 'success', `Meta #${metaId} eliminada permanentemente.`);
  } else {
    addFlash(req, 'danger', 'Error al eliminar la meta.');
  }
  res.redirect('/admin/');
});

// Admin: Acciones en Lote (Batch Actions: archivar, restaurar, eliminar)
app.post('/admin/metas/lote/', requireAdmin, (req: Request, res: Response) => {
  const { meta_ids, action } = req.body;
  let ids: number[] = [];
  if (Array.isArray(meta_ids)) {
    ids = meta_ids.map((id: string) => parseInt(id, 10));
  } else if (typeof meta_ids === 'string') {
    ids = [parseInt(meta_ids, 10)];
  }

  if (ids.length === 0) {
    addFlash(req, 'warning', 'No seleccionaste ninguna meta.');
    return res.redirect('/admin/');
  }

  if (action === 'archivar') {
    const count = store.archiveMetasBatch(ids);
    addFlash(req, 'success', `${count} meta(s) archivada(s) correctamente.`);
  } else if (action === 'restaurar') {
    const count = store.restoreMetasBatch(ids);
    addFlash(req, 'success', `${count} meta(s) restaurada(s) correctamente.`);
  } else if (action === 'eliminar') {
    const count = store.hardDeleteMetasBatch(ids);
    addFlash(req, 'success', `${count} meta(s) eliminada(s) permanentemente.`);
  } else {
    addFlash(req, 'warning', 'Acción no reconocida.');
  }

  res.redirect('/admin/');
});

// Admin: Batch Archive Metas (compatibilidad)
app.post('/admin/metas/archivar-lote/', requireAdmin, (req: Request, res: Response) => {
  const { meta_ids } = req.body;
  let ids: number[] = [];
  if (Array.isArray(meta_ids)) {
    ids = meta_ids.map((id: string) => parseInt(id, 10));
  } else if (typeof meta_ids === 'string') {
    ids = [parseInt(meta_ids, 10)];
  }

  const count = store.archiveMetasBatch(ids);
  addFlash(req, 'success', `${count} meta(s) archivada(s) correctamente.`);
  res.redirect('/admin/');
});

// Admin: Editar / Reemplazar Evidencia de Meta
app.post('/admin/meta/:pk/evidencia/editar/', requireAdmin, uploadMiddleware('evidencia') as any, (req: Request, res: Response) => {
  const metaId = parseInt(req.params.pk, 10);
  const meta = store.getMetaById(metaId);
  if (!meta) {
    addFlash(req, 'danger', 'La meta no existe.');
    return res.redirect('/admin/');
  }
  if (!req.file) {
    addFlash(req, 'warning', 'No seleccionaste un archivo de evidencia.');
    return res.redirect('/admin/');
  }
  const evidenciaPath = `/media/evidencias/uploads/${req.file.filename}`;
  store.updateMetaEvidencia(metaId, evidenciaPath);
  addFlash(req, 'success', `Evidencia de la meta #${metaId} actualizada correctamente.`);
  res.redirect('/admin/');
});

// Admin: Archivar / Retirar Evidencia de Meta
app.post('/admin/meta/:pk/evidencia/archivar/', requireAdmin, (req: Request, res: Response) => {
  const metaId = parseInt(req.params.pk, 10);
  const meta = store.getMetaById(metaId);
  if (!meta) {
    addFlash(req, 'danger', 'La meta no existe.');
    return res.redirect('/admin/');
  }
  store.removeMetaEvidencia(metaId);
  addFlash(req, 'success', `Evidencia de la meta #${metaId} archivada y desvinculada.`);
  res.redirect('/admin/');
});

// Admin: Restaurar Evidencia Archivada
app.post('/admin/meta/:pk/evidencia/restaurar/', requireAdmin, (req: Request, res: Response) => {
  const metaId = parseInt(req.params.pk, 10);
  const meta = store.getMetaById(metaId);
  if (!meta) {
    addFlash(req, 'danger', 'La meta no existe.');
    return res.redirect('/admin/');
  }
  const restored = store.restoreMetaEvidencia(metaId);
  if (restored) {
    addFlash(req, 'success', `Evidencia archivada restaurada exitosamente para la meta #${metaId}.`);
  } else {
    addFlash(req, 'warning', 'No hay evidencia archivada para restaurar en esta meta.');
  }
  res.redirect('/admin/');
});

// Admin: Reset Data to Defaults
app.post('/admin/reset-demo/', requireAdmin, (req: Request, res: Response) => {
  store.resetStoreToDefaults();
  addFlash(req, 'info', 'Datos del sistema restablecidos al estado inicial.');
  res.redirect('/admin/');
});

// Quick switch demo user helper
app.get('/demo-login/:username', (req: Request, res: Response) => {
  const user = store.getUserByUsername(req.params.username);
  if (user) {
    req.session.userId = user.id;
    const delegacion = store.getDelegacion(user.delegacion_id);
    addFlash(
      req,
      'info',
      `Sesión iniciada como: ${user.username} (Rol: ${user.rol} | Delegación: ${delegacion ? delegacion.nombre : 'Global'})`
    );
  }
  res.redirect('/wireframe-front');
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).redirect('/wireframe-front');
});

// Global error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error SGR]', err);
  addFlash(req, 'danger', err.message || 'Ocurrió un error inesperado.');
  res.redirect('/wireframe-front');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
