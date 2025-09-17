import json
import os
import io
import time
from jukbox.Map import Map
from datetime import datetime
from django.conf import settings
from django.shortcuts import render, redirect
import folium
from .forms import FileUploadForm
from .process import generate_spectrogram
from django.http import JsonResponse, StreamingHttpResponse
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image
import obspy
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt


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
        file_name = request.POST.get('fileName')
        if not file_name:
            file_name = str(datetime.now()).strip().replace(".", "_").replace(" ", "_") + ".mseed"
        else:
            file_name = file_name.replace(" ", "_").replace(".", "_") + ".mseed"

        duration = int(request.POST.get('duration', 0))

        print(f"Recording started with file name: {file_name}, Duration: {duration} seconds")
        return JsonResponse({
            'status': 'success',
            'message': f'Recording started for {file_name}',
            'filename': file_name
        })

    return JsonResponse({'status': 'error', 'message': 'Invalid request.'})


def spectrogram_stream(filePath):
    st = obspy.read(filePath)
    st = st.select(component='Z')
    if not st:
        return

    trace = st[0]
    sr = trace.stats.sampling_rate
    chunk_size = int(sr * 2)
    total_samples = len(trace.data)

    fig, ax = plt.subplots(figsize=(10, 6))

    for i in range(0, total_samples, chunk_size):
        segment = trace.data[i:i+chunk_size]

        ax.clear()
        ax.specgram(segment, Fs=sr, NFFT=256, noverlap=128,
                    scale='dB', sides='default', cmap='magma')
        ax.set_title("Live Spectrogram")
        ax.set_xlabel("Time (s)")
        ax.set_ylabel("Frequency (Hz)")
        ax.set_xlim(0, 2)
        ax.set_ylim(1, 40)

        buf = io.BytesIO()
        fig.canvas.draw()
        img = Image.frombytes('RGB', fig.canvas.get_width_height(), fig.canvas.tostring_rgb())
        img.save(buf, format='JPEG')
        frame = buf.getvalue()

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

        time.sleep(0.5)

    plt.close(fig)


def stream_spectrogram_inline(request):
    filename = request.GET.get('filename')
    if not filename:
        return JsonResponse({'status': 'error', 'message': 'Missing filename'}, status=400)

    file_path = os.path.join(settings.MEDIA_ROOT, 'uploads', filename)
    if not os.path.exists(file_path):
        return JsonResponse({'status': 'error', 'message': 'File not found'}, status=404)

    return StreamingHttpResponse(spectrogram_stream(file_path), content_type='multipart/x-mixed-replace; boundary=frame')



@csrf_exempt
def mapView(request):
    lat = 49.17
    lng = -123.96
    
    # Generate the map with Folium
    foliumMap = folium.Map(
        location=[lat, lng],
        zoom_start=5,
        attr="Mapbox"
    )
    # Render map as HTML (don't render circle in Python, we'll do it in JavaScript)
    mapHtml = foliumMap._repr_html_()

    return render(request, 'map.html', {'mapHtml': mapHtml, 'lat': lat, 'lng': lng})

@csrf_exempt
def search_quakes(request):
    if request.method == 'POST':
        print("Received POST request for earthquake search")
        try:
            map = Map()
            # Get the data from the POST request (JSON format)
            search_data = json.loads(request.body)

            print(f"Search data received: {search_data}")
            # Extract the search parameters
            map.lat = search_data.get('lat')
            map.lon = search_data.get('lng')
            map.currentRadius = int(search_data.get('radius'))
            map.dateRange = datetime.strptime(search_data.get('startDate'), '%Y-%m-%d'),datetime.strptime(search_data.get('endDate'), '%Y-%m-%d')
            map.minMag = search_data.get('magnitude')
            map.selectedClient = search_data.get('selectedClient')

            searchResults = map.eventSearch()
            
            response_data = {
                'status': 'success',
                'message': f'Search completed for magnitude {map.minMag}.',
                'stations': searchResults.get('stations', {}),  # Include the stations in the response
                'events': searchResults.get('events', {}),  # Include the events in the response
                'data': searchResults.get('data', [])  # Include the data in the response
            }


            return JsonResponse(response_data, status=200)

        except Exception as e:
            # If something goes wrong, return an error message (without displaying it)
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

            
            
def fetch_waves(request):
    if request.method == 'POST':
        print("Received POST request for fetching waves")

