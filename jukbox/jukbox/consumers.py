import json
from random import randint
from time import sleep
from channels.generic.websocket import WebsocketConsumer


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
