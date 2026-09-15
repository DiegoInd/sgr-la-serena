from django.contrib import admin
from .models import Delegacion, PerfilUsuario, CatalogoServicio, Periodo, Meta

admin.site.register(Delegacion)
admin.site.register(PerfilUsuario)
admin.site.register(CatalogoServicio)
admin.site.register(Periodo)
admin.site.register(Meta)