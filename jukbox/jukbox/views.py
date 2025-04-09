import os
from datetime import datetime
from django.conf import settings
from django.shortcuts import render, redirect
from .forms import FileUploadForm
from .process import generate_spectrogram
from django.http import JsonResponse  # For sending JSON responses

def image_list(request):
    if request.method == 'POST':
        if 'delete' in request.POST:
            file_name = request.POST['delete']
            if file_name in os.listdir(os.path.join(settings.MEDIA_ROOT, 'images')):
                file_path = os.path.join(settings.MEDIA_ROOT, 'images', file_name)
            else:
                file_path = os.path.join(settings.MEDIA_ROOT, 'uploads', file_name)

            if os.path.exists(file_path):
                os.remove(file_path)

            return redirect('image_list') 
        
        elif 'process' in request.POST:
            file_name = request.POST['process']
            file_path = os.path.join(settings.MEDIA_ROOT, 'uploads', file_name)
            if os.path.exists(file_path):
                generate_spectrogram(file_path)
            return redirect('image_list') 

        else:
            for uploaded_file in request.FILES.getlist('files'):
                if uploaded_file.name.endswith(('jpg', 'png', 'jpeg')):
                    image_path = os.path.join(settings.MEDIA_ROOT, 'images', uploaded_file.name)
                    with open(image_path, 'wb+') as destination:
                        for chunk in uploaded_file.chunks():
                            destination.write(chunk)
                else:
                    file_path = os.path.join(settings.MEDIA_ROOT, 'uploads', uploaded_file.name)
                    with open(file_path, 'wb+') as destination:
                        for chunk in uploaded_file.chunks():
                            destination.write(chunk)

            return redirect('image_list')
    else:
        form = FileUploadForm()

    image_folder = os.path.join(settings.MEDIA_ROOT, 'images')
    file_folder = os.path.join(settings.MEDIA_ROOT, 'uploads')
    images = [
        filename for filename in os.listdir(image_folder)
        if filename.endswith(('jpg', 'png', 'jpeg'))
    ]
    files = [
        filename for filename in os.listdir(file_folder)
        if not filename.endswith(('jpg', 'png', 'jpeg'))
    ]

    context = {
        'form': form,
        'images': images,
        'files': files,
    }

    return render(request, 'jukbox/image_list.html', context)

def record_view(request):
    if request.method == 'POST':
        # Get the fileName from the POST data
        file_name = request.POST.get('fileName')
        if not file_name:
            file_name = str(datetime.now()).strip().replace(".","_").replace(" ", "_") + ".mseed"
        else:
            file_name = file_name.replace(" ", "_").replace(".","_") + ".mseed"

        print(f"Recording started with file name: {file_name}")
        return JsonResponse({'status': 'success', 'message': f'Recording started for {file_name}'})
        
        

    return JsonResponse({'status': 'error', 'message': 'Invalid request.'})
