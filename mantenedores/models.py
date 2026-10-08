from django.db import models
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.utils import timezone

class Delegacion(models.Model):
    nombre = models.CharField(max_length=100)
    activa = models.BooleanField(default=True)

    def __str__(self):
        return self.nombre

class PerfilUsuario(models.Model):
    ROLES = (
        ('ADMIN', 'Administrador'),
        ('DELEGADO', 'Delegado'),
        ('FUNCIONARIO', 'Funcionario'),
        ('VERIFICADOR', 'Verificador'),
    )
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='perfilusuario')
    delegacion = models.ForeignKey(Delegacion, on_delete=models.CASCADE)
    rol = models.CharField(max_length=20, choices=ROLES)

    def clean(self):
        super().clean()
        if not self.delegacion.activa:
            raise ValidationError({'delegacion': "No se puede asignar un usuario a una delegación inactiva."})

    def __str__(self):
        return f"{self.user.username} - {self.get_rol_display()} ({self.delegacion.nombre})"

class CatalogoServicio(models.Model):
    nombre_servicio = models.CharField(max_length=150)
    categoria = models.CharField(max_length=100)
    activo = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.nombre_servicio} ({self.categoria})"

class Periodo(models.Model):
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()
    dias_computables = models.IntegerField()
    activo = models.BooleanField(default=True)

    def __str__(self):
        return f"Período {self.fecha_inicio.strftime('%Y')} ({self.fecha_inicio} a {self.fecha_fin})"

class Meta(models.Model):
    delegacion = models.ForeignKey(Delegacion, on_delete=models.CASCADE)
    cargo_o_usuario = models.CharField(max_length=100)
    descripcion = models.TextField()
    ponderacion = models.IntegerField(help_text="Porcentaje de 1 a 100")
    periodo = models.ForeignKey(Periodo, on_delete=models.CASCADE)
    evidencia = models.ImageField(upload_to="evidencias/%Y/%m/", blank=True, null=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.cargo_o_usuario} - {self.ponderacion}% ({self.delegacion.nombre})"

class PasswordResetCode(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    code_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    failed_attempts = models.IntegerField(default=0)

    def is_valid(self):
        return not self.is_used and timezone.now() < self.expires_at and self.failed_attempts < 5