from django import forms
from django.core.exceptions import ValidationError
from pathlib import Path
from PIL import Image, UnidentifiedImageError
from .models import Meta

MAX_SIZE = 2 * 1024 * 1024  # 2MB
ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png']

class MetaForm(forms.ModelForm):
    class Meta:
        model = Meta
        fields = ['cargo_o_usuario', 'periodo', 'ponderacion', 'descripcion', 'evidencia']
        widgets = {
            'cargo_o_usuario': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Ej: Analista de Atención'}),
            'periodo': forms.Select(attrs={'class': 'form-select'}),
            'ponderacion': forms.NumberInput(attrs={'class': 'form-control', 'min': 1, 'max': 100}),
            'descripcion': forms.Textarea(attrs={'class': 'form-control', 'rows': 3}),
            'evidencia': forms.FileInput(attrs={'class': 'form-control', 'accept': '.jpg,.jpeg,.png'}),
        }

    def clean_ponderacion(self):
        ponderacion = self.cleaned_data.get('ponderacion')
        if ponderacion is not None and (ponderacion < 1 or ponderacion > 100):
            raise ValidationError("La ponderación debe estar entre 1% y 100%.")
        return ponderacion

    def clean_evidencia(self):
        evidencia = self.cleaned_data.get('evidencia')
        if not evidencia:
            return evidencia
        if evidencia.size > MAX_SIZE:
            raise ValidationError("La imagen no puede superar los 2 MB.")
        ext = Path(evidencia.name).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise ValidationError("Formato no permitido. Suba JPG o PNG.")
        try:
            with Image.open(evidencia) as img:
                img.verify()
        except (UnidentifiedImageError, OSError):
            raise ValidationError("El archivo no es una imagen válida.")
        finally:
            evidencia.seek(0)
        return evidencia

# ==========================================
# FORMULARIO RECUPERACIÓN DE CONTRASEÑA (CLASE 6)
# ==========================================

class PasswordResetRequestForm(forms.Form):
    email = forms.EmailField(
        label="Correo electrónico registrado",
        widget=forms.EmailInput(attrs={'class': 'form-control', 'placeholder': 'ejemplo@municipalidad.cl'})
    )

class PasswordResetVerifyForm(forms.Form):
    code = forms.CharField(
        label="Código de verificación (6 dígitos)",
        max_length=6,
        min_length=6,
        widget=forms.TextInput(attrs={'class': 'form-control text-center fs-4 fw-bold', 'placeholder': '123456', 'maxlength': '6'})
    )

class PasswordResetConfirmForm(forms.Form):
    new_password = forms.CharField(
        label="Nueva contraseña",
        widget=forms.PasswordInput(attrs={'class': 'form-control', 'placeholder': 'Mínimo 8 caracteres'})
    )
    confirm_password = forms.CharField(
        label="Confirmar nueva contraseña",
        widget=forms.PasswordInput(attrs={'class': 'form-control', 'placeholder': 'Repita la contraseña'})
    )

    def clean_new_password(self):
        pwd = self.cleaned_data.get('new_password')
        if len(pwd) < 8:
            raise ValidationError("La contraseña debe tener al menos 8 caracteres.")
        return pwd

    def clean(self):
        cleaned_data = super().clean()
        pwd = cleaned_data.get('new_password')
        confirm = cleaned_data.get('confirm_password')
        if pwd and confirm and pwd != confirm:
            raise ValidationError("Las contraseñas no coinciden.")
        return cleaned_data