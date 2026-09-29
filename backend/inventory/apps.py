from django.apps import AppConfig
from django.db.models.signals import post_migrate


def seed_inventory_defaults(sender, **kwargs):
    from .models import Category, Section, Warehouse

    for name in ("Zellij", "Ceramic", "Porcelain", "Decorative", "Borders", "Special pieces"):
        Category.objects.get_or_create(name=name)
    for name in ("Wall", "Floor / Taille", "Decoration"):
        Section.objects.get_or_create(name=name)
    Warehouse.objects.get_or_create(name="Shop")

class InventoryConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "inventory"

    def ready(self):
        post_migrate.connect(seed_inventory_defaults, sender=self, dispatch_uid="inventory.seed_defaults")
