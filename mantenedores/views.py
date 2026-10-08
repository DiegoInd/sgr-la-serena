import secrets
from datetime import timedelta
from django.shortcuts import render, redirect, get_object_or_404
from django.views.generic import ListView, CreateView, UpdateView, DeleteView, FormView
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
from django.contrib.messages.views import SuccessMessageMixin
from django.contrib import messages
from django.contrib.auth.models import User
from django.contrib.auth.hashers import make_password, check_password
from django.core.mail import send_mail
from django.core.paginator import Paginator
from django.urls import reverse_lazy
from django.utils import timezone

from .models import Meta, PasswordResetCode, Delegacion
from .forms import MetaForm, PasswordResetRequestForm, PasswordResetVerifyForm, PasswordResetConfirmForm


# ==========================================
# MIXINS Y VISTAS DE METAS
# ==========================================

class MetaScopedQuerysetMixin:
    """Restringe la consulta según la delegación del usuario autenticado."""
    def get_queryset(self):
        qs = Meta.objects.filter(deleted_at__isnull=True).order_by('id')
        if self.request.user.is_superuser:
            return qs
        perfil = getattr(self.request.user, 'perfilusuario', None)
        if perfil:
            return qs.filter(delegacion=perfil.delegacion)
        return qs.none()


class MetaListView(LoginRequiredMixin, MetaScopedQuerysetMixin, ListView):
    model = Meta
    template_name = 'metas/registro_meta.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        
        raw_size = self.request.GET.get('page_size')
        if raw_size in ['5', '15', '30']:
            self.request.session['meta_page_size'] = int(raw_size)
        
        page_size = self.request.session.get('meta_page_size', 5)
        
        queryset = self.get_queryset()
        paginator = Paginator(queryset, page_size)
        page_number = self.request.GET.get('page')
        
        context['page_obj'] = paginator.get_page(page_number)
        context['page_size'] = page_size
        return context


class MetaCreateView(LoginRequiredMixin, PermissionRequiredMixin, SuccessMessageMixin, MetaScopedQuerysetMixin, CreateView):
    model = Meta
    form_class = MetaForm
    template_name = 'metas/registro_meta.html'
    permission_required = 'mantenedores.add_meta'
    raise_exception = True
    success_url = reverse_lazy('wireframe_front')
    success_message = "Meta registrada correctamente."

    def form_valid(self, form):
        # Asignación segura de delegación para evitar IntegrityError
        perfil = getattr(self.request.user, 'perfilusuario', None)
        if perfil:
            form.instance.delegacion = perfil.delegacion
        else:
            # Si es admin/superusuario sin perfil, asigna la primera delegación activa
            delegacion_defecto = Delegacion.objects.filter(activa=True).first() or Delegacion.objects.first()
            if not delegacion_defecto:
                delegacion_defecto = Delegacion.objects.create(nombre="Delegación Central", activa=True)
            form.instance.delegacion = delegacion_defecto

        return super().form_valid(form)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        page_size = self.request.session.get('meta_page_size', 5)
        paginator = Paginator(self.get_queryset(), page_size)
        context['page_obj'] = paginator.get_page(self.request.GET.get('page'))
        context['page_size'] = page_size
        context['open_modal'] = True
        return context


class MetaUpdateView(LoginRequiredMixin, PermissionRequiredMixin, SuccessMessageMixin, MetaScopedQuerysetMixin, UpdateView):
    model = Meta
    form_class = MetaForm
    template_name = 'metas/registro_meta.html'
    permission_required = 'mantenedores.change_meta'
    raise_exception = True
    success_url = reverse_lazy('wireframe_front')
    success_message = "Meta actualizada correctamente."

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        page_size = self.request.session.get('meta_page_size', 5)
        paginator = Paginator(self.get_queryset(), page_size)
        context['page_obj'] = paginator.get_page(self.request.GET.get('page'))
        context['page_size'] = page_size
        context['open_modal'] = True
        return context


class MetaDeleteView(LoginRequiredMixin, PermissionRequiredMixin, SuccessMessageMixin, MetaScopedQuerysetMixin, DeleteView):
    model = Meta
    permission_required = 'mantenedores.delete_meta'
    raise_exception = True
    success_url = reverse_lazy('wireframe_front')
    success_message = "Meta archivada correctamente."

    def post(self, request, *args, **kwargs):
        self.object = self.get_object()
        self.object.deleted_at = timezone.now()
        self.object.save()
        return redirect(self.success_url)


def vista_wireframe(request):
    if request.user.is_authenticated:
        return MetaListView.as_view()(request)
    return render(request, 'metas/registro_meta.html')


# ==========================================
# VISTAS RECUPERACIÓN DE CONTRASEÑA
# ==========================================

class PasswordResetRequestView(FormView):
    template_name = 'registration/password_reset_request.html'
    form_class = PasswordResetRequestForm
    success_url = reverse_lazy('password_reset_verify')

    def form_valid(self, form):
        email = form.cleaned_data['email']
        user = User.objects.filter(email=email).first()

        if user:
            # Invalidar códigos anteriores del usuario
            PasswordResetCode.objects.filter(user=user, is_used=False).update(is_used=True)

            code = f"{secrets.randbelow(1000000):06d}"
            code_hash = make_password(code)
            expires_at = timezone.now() + timedelta(seconds=120)

            PasswordResetCode.objects.create(
                user=user,
                code_hash=code_hash,
                expires_at=expires_at
            )

            self.request.session['reset_user_id'] = user.pk

            send_mail(
                subject="Código de Recuperación - SGR La Serena",
                message=f"Hola {user.username}, tu código temporal de recuperación es: {code}\nVálido durante 120 segundos.",
                from_email="no-reply@laserena.cl",
                recipient_list=[email],
                fail_silently=False,
            )

        messages.info(self.request, "Si el correo corresponde a una cuenta registrada, se ha enviado un código temporal.")
        return super().form_valid(form)


class PasswordResetVerifyView(FormView):
    template_name = 'registration/password_reset_verify.html'
    form_class = PasswordResetVerifyForm
    success_url = reverse_lazy('password_reset_confirm')

    def form_valid(self, form):
        user_id = self.request.session.get('reset_user_id')
        if not user_id:
            messages.error(self.request, "Sesión de recuperación inválida o expirada.")
            return redirect('password_reset_request')

        input_code = form.cleaned_data['code']
        reset_obj = PasswordResetCode.objects.filter(user_id=user_id, is_used=False).order_by('-created_at').first()

        if not reset_obj:
            messages.error(self.request, "No existe un código activo.")
            return redirect('password_reset_request')

        # 1. Comprobar expiración por tiempo (120 segundos)
        if timezone.now() > reset_obj.expires_at:
            messages.error(self.request, "El código ha expirado.")
            return redirect('password_reset_request')

        # 2. Comprobar si ya estaba bloqueado por intentos previos
        if reset_obj.failed_attempts >= 5:
            messages.error(self.request, "Ha superado el número máximo de intentos.")
            return redirect('password_reset_request')

        # 3. Validar si el código ingresado es correcto
        if not check_password(input_code, reset_obj.code_hash):
            reset_obj.failed_attempts += 1
            reset_obj.save()

            # Si alcanza 5 fallos, bloquear inmediatamente
            if reset_obj.failed_attempts >= 5:
                messages.error(self.request, "Ha superado el número máximo de intentos.")
                return redirect('password_reset_request')

            intentos_restantes = 5 - reset_obj.failed_attempts
            messages.error(self.request, f"Código incorrecto. Intentos restantes: {intentos_restantes}")
            return self.form_invalid(form)

        self.request.session['reset_code_id'] = reset_obj.pk
        messages.success(self.request, "Código verificado correctamente.")
        return super().form_valid(form)


class PasswordResetConfirmView(FormView):
    template_name = 'registration/password_reset_confirm.html'
    form_class = PasswordResetConfirmForm
    success_url = reverse_lazy('login')

    def form_valid(self, form):
        code_id = self.request.session.get('reset_code_id')
        if not code_id:
            messages.error(self.request, "Proceso no autorizado.")
            return redirect('password_reset_request')

        reset_obj = PasswordResetCode.objects.get(pk=code_id)
        user = reset_obj.user

        user.set_password(form.cleaned_data['new_password'])
        user.save()

        reset_obj.is_used = True
        reset_obj.save()

        self.request.session.pop('reset_user_id', None)
        self.request.session.pop('reset_code_id', None)

        messages.success(self.request, "¡Contraseña actualizada con éxito!")
        return super().form_valid(form)