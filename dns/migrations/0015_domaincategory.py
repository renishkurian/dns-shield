from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dns', '0014_aireportcache'),
    ]

    operations = [
        migrations.CreateModel(
            name='DomainCategory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('domain', models.CharField(db_index=True, max_length=255, unique=True)),
                ('category', models.CharField(db_index=True, default='other', max_length=40)),
                ('site_name', models.CharField(blank=True, max_length=255)),
                ('url', models.CharField(blank=True, max_length=512)),
                ('confidence', models.CharField(blank=True, default='medium', max_length=16)),
                ('source', models.CharField(blank=True, default='ai', max_length=40)),
                ('hit_count', models.PositiveIntegerField(default=0)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name_plural': 'domain categories',
                'ordering': ['domain'],
            },
        ),
    ]
