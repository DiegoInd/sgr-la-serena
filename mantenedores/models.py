from django.db import models
from django.contrib.auth.models import User

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
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    delegacion = models.ForeignKey(Delegacion, on_delete=models.CASCADE)
    rol = models.CharField(max_length=20, choices=ROLES)

class CatalogoServicio(models.Model):
    nombre_servicio = models.CharField(max_length=150)
    categoria = models.CharField(max_length=100)
    activo = models.BooleanField(default=True)

class Periodo(models.Model):
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()
    dias_computables = models.IntegerField()
    activo = models.BooleanField(default=True)

class Meta(models.Model):
    cargo_o_usuario = models.CharField(max_length=100)
    descripcion = models.TextField()
    ponderacion = models.IntegerField(help_text="Porcentaje de 1 a 100")
    periodo = models.ForeignKey(Periodo, on_delete=models.CASCADE)