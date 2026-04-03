"""
Django Channels WebSocket consumers for real-time data streaming.
"""
import json
from channels.generic.websocket import AsyncWebsocketConsumer


class QueryLogConsumer(AsyncWebsocketConsumer):
    """Streams live DNS query log entries to authenticated clients."""

    async def connect(self):
        user = self.scope['user']
        if not user.is_authenticated:
            await self.close()
            return
        await self.channel_layer.group_add('query_log', self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        await self.channel_layer.group_discard('query_log', self.channel_name)

    async def query_event(self, event):
        await self.send(text_data=json.dumps(event['data']))


class GravityConsumer(AsyncWebsocketConsumer):
    """Streams gravity update progress to admin users."""

    async def connect(self):
        user = self.scope['user']
        if not user.is_authenticated:
            await self.close()
            return
        try:
            is_admin = user.profile.is_admin
        except Exception:
            is_admin = user.is_superuser
        if not is_admin:
            await self.close()
            return
        await self.channel_layer.group_add('gravity', self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        await self.channel_layer.group_discard('gravity', self.channel_name)

    async def gravity_output(self, event):
        await self.send(text_data=json.dumps(event['data']))
