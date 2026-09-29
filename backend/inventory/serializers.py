from rest_framework import serializers
from django.core.exceptions import ObjectDoesNotExist

from .models import (
    Category,
    Customer,
    InventorySettings,
    Product,
    Purchase,
    PurchaseItem,
    Sale,
    SaleItem,
    Section,
    Stock,
    StockMovement,
    Supplier,
    Warehouse,
)


def user_has_financial_access(user):
    if not user:
        return False
    if user.is_superuser:
        return True
    try:
        return user.profile.role in {"owner", "manager"}
    except ObjectDoesNotExist:
        return False


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ("id", "name")


class SectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Section
        fields = ("id", "name")


class WarehouseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Warehouse
        fields = ("id", "name", "address")


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ("id", "name", "contact", "phone", "whatsapp", "address", "notes")


class CustomerSerializer(serializers.ModelSerializer):
    total_purchases = serializers.SerializerMethodField()
    amount_paid = serializers.SerializerMethodField()
    amount_remaining = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = ("id", "name", "phone", "whatsapp", "address", "city", "notes", "total_purchases", "amount_paid", "amount_remaining")

    def get_total_purchases(self, customer):
        return sum((sale.total for sale in customer.sales.filter(status="completed")), 0)

    def get_amount_paid(self, customer):
        return sum((payment.amount for payment in customer.payments.all()), 0)

    def get_amount_remaining(self, customer):
        return sum((sale.remaining for sale in customer.sales.filter(status="completed")), 0)


class ProductSerializer(serializers.ModelSerializer):
    total_cartons = serializers.DecimalField(read_only=True, max_digits=12, decimal_places=3)
    total_m2 = serializers.DecimalField(read_only=True, max_digits=16, decimal_places=3)
    category_name = serializers.CharField(source="category.name", read_only=True)
    section_name = serializers.CharField(source="section.name", read_only=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    stock_by_warehouse = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        user = self.context.get("request").user if self.context.get("request") else None
        if not user_has_financial_access(user):
            self.fields.pop("purchase_price", None)

    def get_stock_by_warehouse(self, product):
        return [
            {"warehouse_id": row.warehouse_id, "warehouse": row.warehouse.name, "cartons": row.cartons}
            for row in product.stock_rows.select_related("warehouse").all()
        ]


class StockSerializer(serializers.ModelSerializer):
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)

    class Meta:
        model = Stock
        fields = ("id", "product", "warehouse", "warehouse_name", "cartons")
        read_only_fields = fields


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_reference = serializers.CharField(source="product.reference", read_only=True)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True, default="")

    class Meta:
        model = StockMovement
        fields = "__all__"
        read_only_fields = fields


class SaleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    subtotal = serializers.DecimalField(read_only=True, max_digits=16, decimal_places=2)

    class Meta:
        model = SaleItem
        exclude = ("purchase_unit_cost",)


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)
    subtotal = serializers.DecimalField(read_only=True, max_digits=16, decimal_places=2)
    total = serializers.DecimalField(read_only=True, max_digits=16, decimal_places=2)
    remaining = serializers.DecimalField(read_only=True, max_digits=16, decimal_places=2)
    customer_name = serializers.CharField(source="customer.name", read_only=True, default="Walk-in customer")

    class Meta:
        model = Sale
        fields = ("id", "customer", "customer_name", "status", "discount", "delivery_fee", "paid", "created_at", "items", "subtotal", "total", "remaining")
        read_only_fields = ("status", "created_at")


class PurchaseItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = PurchaseItem
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        user = self.context.get("request").user if self.context.get("request") else None
        if not user_has_financial_access(user):
            self.fields.pop("purchase_price", None)


class PurchaseSerializer(serializers.ModelSerializer):
    items = serializers.SerializerMethodField()
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)

    class Meta:
        model = Purchase
        fields = ("id", "supplier", "supplier_name", "invoice_reference", "notes", "status", "created_at", "items")

    def get_items(self, purchase):
        return PurchaseItemSerializer(purchase.items.all(), many=True, context=self.context).data


class InventorySettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventorySettings
        fields = ("whole_carton_required", "stock_control_enabled", "updated_at")
        read_only_fields = ("updated_at",)