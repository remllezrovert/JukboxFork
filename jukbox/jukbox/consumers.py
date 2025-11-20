import json
from random import randint
from time import sleep
from channels.generic.websocket import WebsocketConsumer, AsyncWebsocketConsumer


class PubSubConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        self.topic = self.scope["url_route"]["kwargs"]["topic"]
        self.group_name = f"topic_{self.topic}"

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)

        await self.channel_layer.group_send(
            self.group_name,
            {
                "message": data,
                "sender": self.channel_name,
                "type": "broadcast_message",
            }
        )
        #print(f"Received message on topic {self.topic}: {data}")

    async def broadcast_message(self, event):
        if self.channel_name != event["sender"] and not event["message"].get("subscribe",None) and not event["message"].get("channels",None):
            #print(f"Broadcasting message to topic {self.topic}: {event['message']}")
            await self.send(text_data=json.dumps(event['message']))

