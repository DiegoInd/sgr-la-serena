# SGR La Serena - Sistema de Gestión de Resultados

Prototipo de software para la administración, seguimiento y auditoría de metas e indicadores territoriales de las delegaciones municipales de la Ilustre Municipalidad de La Serena.

Proyecto desarrollado bajo una arquitectura web modular en Django, aplicando la Ley N° 21.459 de Delitos Informáticos, estándares de seguridad OWASP Top 10 y un plan de pruebas integrales de calidad de software.

---

## Guía de Instalación y Configuración

### 1. Clonar el repositorio

git clone https://github.com/DiegoInd/sgr-la-serena

cd sgr-la-serena

### 2. Crear y activar el entorno virtual

En Windows (PowerShell):

PowerShell
python -m venv venv
.\venv\Scripts\Activate.ps1

En Linux / macOS / Git Bash:
python3 -m venv venv
source venv/bin/activate

### 3. Instalar las dependencias
Bash
pip install -r requirements.txt

### 4. Aplicar las migraciones de la base de datos
Bash
python manage.py makemigrations
python manage.py migrate

### 5. Crear cuenta de Administrador
Bash
python manage.py createsuperuser

### 6. Iniciar el servidor de desarrollo
Bash
python manage.py runserver
