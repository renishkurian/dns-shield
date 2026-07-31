import sys
import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from dns.serializers import ClientSerializer
from dns.models import Client
print(ClientSerializer(Client.objects.first()).data if Client.objects.exists() else "No client")
