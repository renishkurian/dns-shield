from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dns', '0015_domaincategory'),
    ]

    operations = [
        migrations.AddField(
            model_name='client',
            name='route_via_tor',
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text='When true, DNS queries for this client are resolved via Tor (127.0.0.1:9053) instead of Unbound',
            ),
        ),
    ]
