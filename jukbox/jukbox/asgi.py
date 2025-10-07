import os
import django

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from jukbox.routing import ws_urlpatterns
from django.core.asgi import get_asgi_application


os.environ.setdefault('DJANGO_SETTINGS_MODULE','jukbox.settings')
django.setup()



application = ProtocolTypeRouter({
        "http":get_asgi_application(),
        'websocket':AuthMiddlewareStack(URLRouter(ws_urlpatterns))
    }
)

