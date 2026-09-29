from django.contrib import admin
from .models import (
    Category,
    Customer,
    InventorySettings,
    Payment,
    Product,
    ProjectCalculation,
    Purchase,
    PurchaseItem,
    Sale,
    SaleItem,
    Section,
    Stock,
    StockMovement,
    Supplier,
    UserProfile,
    Warehouse,
)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("reference", "name", "category", "section", "selling_price_carton")
    search_fields = ("reference", "name", "color", "dimensions", "supplier__name")
    list_filter = ("category", "section", "product_type")


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ("created_at", "product", "warehouse", "movement_type", "quantity", "previous_stock", "new_stock", "user")
    list_filter = ("movement_type", "warehouse")
    readonly_fields = ("product", "warehouse", "movement_type", "quantity", "previous_stock", "new_stock", "reference", "user", "created_at")

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Stock)
class StockAdmin(admin.ModelAdmin):
    list_display = ("product", "warehouse", "cartons")
    readonly_fields = ("product", "warehouse", "cartons")

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ("id", "customer", "status", "created_at")
    readonly_fields = tuple(field.name for field in Sale._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Purchase)
class PurchaseAdmin(admin.ModelAdmin):
    list_display = ("id", "supplier", "status", "created_at")
    readonly_fields = tuple(field.name for field in Purchase._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class RecordedDetailAdmin(admin.ModelAdmin):
    def get_readonly_fields(self, request, obj=None):
        return tuple(field.name for field in self.model._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


for model in (SaleItem, PurchaseItem, Payment):
    admin.site.register(model, RecordedDetailAdmin)


for model in (Category, Section, Warehouse, Supplier, Customer, ProjectCalculation, UserProfile, InventorySettings):
    admin.site.register(model)
