from django.urls import re_path
from dns import consumers as dns_consumers

websocket_urlpatterns = [
    re_path(r'^ws/queries/?$', dns_consumers.QueryLogConsumer.as_asgi()),
    re_path(r'^ws/gravity/?$', dns_consumers.GravityConsumer.as_asgi()),
]
