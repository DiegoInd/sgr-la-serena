from django.shortcuts import render

# Create your views here.
def vista_wireframe(request):
    return render(request, 'metas/registro_meta.html')