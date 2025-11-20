import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from django.urls import path
import jukbox.consumers as consumers

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'jukbox.settings')

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": URLRouter([
        path("pubsub/<str:topic>/", consumers.PubSubConsumer.as_asgi()),
    ]),
})
