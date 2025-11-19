from django.urls import path
from .consumers import GraphConsumer
from .consumers import PubSubConsumer
ws_urlpatterns = [
   path('ws/pubsub/<str:topic>/',PubSubConsumer.as_asgi())
]