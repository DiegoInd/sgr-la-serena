from django.contrib import admin
from django.utils import timezone
from .models import Delegacion, PerfilUsuario, CatalogoServicio, Periodo, Meta, PasswordResetCode

# Inline para administrar usuarios dentro del formulario de Delegación (Clase 5)
class PerfilUsuarioInline(admin.TabularInline):
    model = PerfilUsuario
    extra = 0
    fields = ('user', 'rol')

@admin.register(Delegacion)
class DelegacionAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'activa')
    list_filter = ('activa',)
    search_fields = ('nombre',)
    inlines = [PerfilUsuarioInline]

@admin.register(Periodo)
class PeriodoAdmin(admin.ModelAdmin):
    list_display = ('fecha_inicio', 'fecha_fin', 'dias_computables', 'activo')
    list_filter = ('activo',)
    date_hierarchy = 'fecha_inicio'  # Navegación por fechas (Clase 3)

@admin.register(CatalogoServicio)
class CatalogoServicioAdmin(admin.ModelAdmin):
    list_display = ('nombre_servicio', 'categoria', 'activo')
    list_filter = ('categoria', 'activo')
    search_fields = ('nombre_servicio', 'categoria')

@admin.action(description="Archivar metas seleccionadas (Borrado Lógico)")
def archive_metas(modeladmin, request, queryset):
    updated = queryset.filter(deleted_at__isnull=True).update(deleted_at=timezone.now())
    modeladmin.message_user(request, f"{updated} meta(s) archivada(s) correctamente.")

@admin.register(Meta)
class MetaAdmin(admin.ModelAdmin):
    list_display = ('cargo_o_usuario', 'delegacion', 'periodo', 'ponderacion', 'deleted_at')
    list_filter = ('delegacion', 'periodo')
    search_fields = ('cargo_o_usuario', 'descripcion', 'delegacion__nombre')
    list_select_related = ('delegacion', 'periodo')
    actions = [archive_metas]

    # Scoping de QuerySet (Clase 5)
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        qs = qs.filter(deleted_at__isnull=True)
        if request.user.is_superuser:
            return qs
        perfil = getattr(request.user, 'perfilusuario', None)
        if perfil:
            return qs.filter(delegacion=perfil.delegacion)
        return qs.none()

    # Limitar opciones de ForeignKey en el selector del Admin (Clase 5)
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "periodo":
            kwargs["queryset"] = Periodo.objects.filter(activo=True)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    # Protección de edición a nivel de objeto (Clase 5)
    def has_change_permission(self, request, obj=None):
        allowed = super().has_change_permission(request, obj)
        if not allowed or obj is None or request.user.is_superuser:
            return allowed
        perfil = getattr(request.user, 'perfilusuario', None)
        return perfil and obj.delegacion_id == perfil.delegacion_id

    def save_model(self, request, obj, form, change):
        if not request.user.is_superuser and hasattr(request.user, 'perfilusuario'):
            obj.delegacion = request.user.perfilusuario.delegacion
        super().save_model(request, obj, form, change)

admin.site.register(PerfilUsuario)
admin.site.register(PasswordResetCode)