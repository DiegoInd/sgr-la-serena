import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { store, User } from './models/store.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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

// Session setup
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'sgr-la-serena-dev-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 24 hours
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

  // Add current logged in user to res.locals
  if (req.session.userId) {
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
        perfilusuario: {
          rol: user.rol,
          delegacion: delegacion ? { id: delegacion.id, nombre: delegacion.nombre } : { id: 0, nombre: 'Global' },
        },
      };
      res.locals.perms = {
        mantenedores: {
          add_meta: user.rol === 'ADMIN' || user.rol === 'DELEGADO' || user.rol === 'FUNCIONARIO',
          change_meta: user.rol === 'ADMIN' || user.rol === 'DELEGADO' || user.rol === 'FUNCIONARIO',
          delete_meta: user.rol === 'ADMIN' || user.rol === 'DELEGADO',
        },
      };
    } else {
      res.locals.user = { is_authenticated: false };
      res.locals.perms = { mantenedores: {} };
    }
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

// Root redirect
app.get('/', (_req: Request, res: Response) => {
  res.redirect('/wireframe-front');
});

// ==========================================
// CRUD METAS & WIREFRAME
// ==========================================

app.get('/wireframe-front', (req: Request, res: Response) => {
  const currentUser: User | null = req.session.userId ? store.getUser(req.session.userId) || null : null;

  // Page size preference
  const rawSize = req.query.page_size as string;
  if (rawSize && ['5', '15', '30'].includes(rawSize)) {
    req.session.meta_page_size = parseInt(rawSize, 10);
  }
  const pageSize = req.session.meta_page_size || 5;

  const searchQuery = (req.query.q as string) || '';
  const filterDelegacion = req.query.delegacion ? parseInt(req.query.delegacion as string, 10) : undefined;
  const filterPeriodo = req.query.periodo ? parseInt(req.query.periodo as string, 10) : undefined;
  const showArchived = req.query.status === 'archivadas';

  // Fetch filtered metas
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
    form: null,
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

// Middleware helper to safely handle multer uploads with errors
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

  // Delegación assignment
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

  // Authorization check
  if (!currentUser.is_superuser && currentUser.rol !== 'ADMIN' && meta.delegacion_id !== currentUser.delegacion_id) {
    addFlash(req, 'danger', 'No tiene permisos para editar metas de otra delegación.');
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
  if (!currentUser.is_superuser && currentUser.rol !== 'ADMIN' && meta.delegacion_id !== currentUser.delegacion_id) {
    addFlash(req, 'danger', 'No tiene permisos para modificar esta meta.');
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
        delegacion: delegacion || meta.delegacion_id,
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
  store.updateMeta(metaId, {
    cargo_o_usuario: cargo_o_usuario.trim(),
    descripcion: descripcion.trim(),
    ponderacion: numPonderacion,
    periodo_id: parseInt(periodo, 10),
    delegacion_id: delegacion ? parseInt(delegacion, 10) : undefined,
    evidencia: evidenciaPath,
  });

  addFlash(req, 'success', 'Meta actualizada correctamente.');
  res.redirect('/wireframe-front');
};

app.post('/wireframe-front/meta/:pk/editar/', uploadMiddleware('evidencia') as any, handleUpdateMeta as any);

// Meta Delete (Archive)
app.post('/wireframe-front/meta/:pk/eliminar/', (req: Request, res: Response) => {
  if (!req.session.userId) {
    addFlash(req, 'danger', 'Debe iniciar sesión para archivar una meta.');
    return res.redirect('/login');
  }

  const metaId = parseInt(req.params.pk, 10);
  const success = store.softDeleteMeta(metaId);
  if (success) {
    addFlash(req, 'success', 'Meta archivada correctamente.');
  } else {
    addFlash(req, 'danger', 'Error al archivar la meta.');
  }
  res.redirect('/wireframe-front');
});

// Meta Restore (Unarchive)
app.post('/wireframe-front/meta/:pk/restaurar/', (req: Request, res: Response) => {
  if (!req.session.userId) {
    addFlash(req, 'danger', 'Debe iniciar sesión para restaurar una meta.');
    return res.redirect('/login');
  }

  const metaId = parseInt(req.params.pk, 10);
  const success = store.restoreMeta(metaId);
  if (success) {
    addFlash(req, 'success', 'Meta restaurada con éxito.');
  } else {
    addFlash(req, 'danger', 'Error al restaurar la meta.');
  }
  res.redirect('/wireframe-front?status=archivadas');
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
    res.redirect('/login');
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
// ADMIN PANEL OVERVIEW & MANAGEMENT (/admin/)
// ==========================================

app.get(['/admin', '/admin/'], (_req: Request, res: Response) => {
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
app.post('/admin/delegacion/:id/toggle/', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const d = store.getDelegacion(id);
  if (d) {
    store.updateDelegacion(id, { activa: !d.activa });
    addFlash(req, 'success', `Delegación "${d.nombre}" actualizada.`);
  }
  res.redirect('/admin/');
});

// Admin: Nueva Delegacion
app.post('/admin/delegacion/nueva/', (req: Request, res: Response) => {
  const { nombre } = req.body;
  if (nombre && nombre.trim()) {
    store.createDelegacion(nombre.trim(), true);
    addFlash(req, 'success', 'Delegación agregada exitosamente.');
  }
  res.redirect('/admin/');
});

// Admin: Toggle Periodo
app.post('/admin/periodo/:id/toggle/', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const p = store.getPeriodo(id);
  if (p) {
    store.updatePeriodo(id, { activo: !p.activo });
    addFlash(req, 'success', `Período "${p.label}" actualizado.`);
  }
  res.redirect('/admin/');
});

// Admin: Nuevo Periodo
app.post('/admin/periodo/nuevo/', (req: Request, res: Response) => {
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
app.post('/admin/servicio/:id/toggle/', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const s = store.getServicios().find((item) => item.id === id);
  if (s) {
    store.updateServicio(id, { activo: !s.activo });
    addFlash(req, 'success', `Servicio "${s.nombre_servicio}" actualizado.`);
  }
  res.redirect('/admin/');
});

// Admin: Nuevo Servicio
app.post('/admin/servicio/nuevo/', (req: Request, res: Response) => {
  const { nombre_servicio, categoria } = req.body;
  if (nombre_servicio && categoria) {
    store.createServicio(nombre_servicio.trim(), categoria.trim(), true);
    addFlash(req, 'success', 'Servicio incorporado al catálogo.');
  }
  res.redirect('/admin/');
});

// Admin: Nuevo Usuario
app.post('/admin/usuario/nuevo/', (req: Request, res: Response) => {
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

// Admin: Batch Archive Metas (como la acción archive_metas en Django Admin)
app.post('/admin/metas/archivar-lote/', (req: Request, res: Response) => {
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

// Admin: Reset Data to Defaults
app.post('/admin/reset-demo/', (req: Request, res: Response) => {
  store.resetStoreToDefaults();
  addFlash(req, 'info', 'Datos del sistema restablecidos al estado inicial.');
  res.redirect('/admin/');
});

// Quick switch demo user helper
app.get('/demo-login/:username', (req: Request, res: Response) => {
  const user = store.getUserByUsername(req.params.username);
  if (user) {
    req.session.userId = user.id;
    addFlash(req, 'info', `Sesión iniciada como: ${user.username} (Rol: ${user.rol})`);
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
