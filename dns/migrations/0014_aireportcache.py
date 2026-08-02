# Generated manually for AI report cache

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('dns', '0013_client_shield_bypass'),
    ]

    operations = [
        migrations.CreateModel(
            name='AIReportCache',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('range_from', models.DateTimeField(db_index=True)),
                ('range_to', models.DateTimeField(db_index=True)),
                ('client_ip', models.GenericIPAddressField(blank=True, null=True)),
                ('summary', models.TextField(blank=True)),
                ('domains_found', models.PositiveIntegerField(default=0)),
                ('domains_analyzed', models.PositiveIntegerField(default=0)),
                ('payload', models.JSONField(default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('created_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
