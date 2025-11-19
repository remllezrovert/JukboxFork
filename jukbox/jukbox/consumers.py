import json
from random import randint
from time import sleep
from channels.generic.websocket import WebsocketConsumer, AsyncWebsocketConsumer



class GraphConsumer(WebsocketConsumer):
    def connect(self):
        self.accept()

        for i in range (1000):
            self.send(json.dumps({'value':randint(-20,20)}))
            sleep(1)

    def disconnect(self, code):
        self.close()

    def receive(self, text_data = None, bytes_data = None):
        text_data_json = json.loads(text_data)
        expression = text_data_json['expression']





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
                "type": "broadcast_message",
                "message": data["message"],
                "sender": self.channel_name,  # mark who sent it
            }
        )

    async def broadcast_message(self, event):
        if self.channel_name != event["sender"]:
            await self.send(text_data=json.dumps({
                "message": event["message"]
            }))

