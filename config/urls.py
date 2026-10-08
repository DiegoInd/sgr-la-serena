from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.shortcuts import redirect
from mantenedores.views import (
    vista_wireframe, 
    MetaCreateView, 
    MetaUpdateView, 
    MetaDeleteView,
    PasswordResetRequestView,
    PasswordResetVerifyView,
    PasswordResetConfirmView
)

urlpatterns = [
    path('', lambda request: redirect('wireframe_front')),
    path('admin/', admin.site.urls),
    path('accounts/', include('django.contrib.auth.urls')),

    # Rutas del Desafío de Recuperación por Código Temporal (Clase 6)
    path('password-reset/', PasswordResetRequestView.as_view(), name='password_reset_request'),
    path('password-reset/verify/', PasswordResetVerifyView.as_view(), name='password_reset_verify'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password_reset_confirm'),

    # Rutas CRUD SGR
    path('wireframe-front/', vista_wireframe, name='wireframe_front'),
    path('wireframe-front/meta/nueva/', MetaCreateView.as_view(), name='meta_create'),
    path('wireframe-front/meta/<int:pk>/editar/', MetaUpdateView.as_view(), name='meta_update'),
    path('wireframe-front/meta/<int:pk>/eliminar/', MetaDeleteView.as_view(), name='meta_delete'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)