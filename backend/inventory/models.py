from decimal import Decimal
from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Sum


class UserProfile(models.Model):
    ROLES = [
        ("owner", "Owner"),
        ("manager", "Manager"),
        ("employee", "Employee"),
        ("warehouse", "Warehouse"),
    ]
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=20, choices=ROLES, default="employee")

    def __str__(self):
        return f"{self.user.username} ({self.role})"

class Category(models.Model):
    name = models.CharField(max_length=80, unique=True)
    def __str__(self):
        return self.name

class Section(models.Model):
    name = models.CharField(max_length=80, unique=True)
    def __str__(self):
        return self.name

class Warehouse(models.Model):
    name = models.CharField(max_length=120, unique=True)
    address = models.CharField(max_length=255, blank=True)
    def __str__(self):
        return self.name


class InventorySettings(models.Model):
    whole_carton_required = models.BooleanField(default=True)
    stock_control_enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return "Inventory settings"

class Supplier(models.Model):
    name = models.CharField(max_length=160)
    contact = models.CharField(max_length=160, blank=True)
    phone = models.CharField(max_length=40, blank=True)
    whatsapp = models.CharField(max_length=40, blank=True)
    address = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    def __str__(self): return self.name

class Product(models.Model):
    TYPES = [("tile", "Tile"), ("zellij", "Zellij"), ("special", "Special piece")]
    UNITS = [("carton", "Carton"), ("m2", "m²")]
    reference = models.CharField(max_length=60, unique=True)
    name = models.CharField(max_length=180)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    section = models.ForeignKey(Section, on_delete=models.PROTECT, related_name="products")
    product_type = models.CharField(max_length=20, choices=TYPES, default="tile")
    dimensions = models.CharField(max_length=80, blank=True)
    color = models.CharField(max_length=80, blank=True)
    design = models.CharField(max_length=120, blank=True)
    unit = models.CharField(max_length=20, choices=UNITS, default="carton")
    pieces_per_carton = models.PositiveIntegerField(default=1)
    m2_per_carton = models.DecimalField(max_digits=8, decimal_places=3, validators=[MinValueValidator(Decimal("0.001"))])
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0"))])
    selling_price_carton = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0"))])
    selling_price_m2 = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0"))])
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="products")
    minimum_stock = models.DecimalField(max_digits=12, decimal_places=3, default=0, validators=[MinValueValidator(Decimal("0"))])
    image = models.ImageField(upload_to="products/", blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    @property
    def total_cartons(self):
        return self.stock_rows.aggregate(total=Sum("cartons"))["total"] or Decimal("0")

    @property
    def total_m2(self):
        return self.total_cartons * self.m2_per_carton

    def __str__(self):
        return f"{self.reference} - {self.name}"

class Stock(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="stock_rows")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="stock_rows")
    cartons = models.DecimalField(max_digits=12, decimal_places=3, default=0, validators=[MinValueValidator(Decimal("0"))])
    class Meta:
        constraints = [models.UniqueConstraint(fields=("product", "warehouse"), name="unique_product_warehouse_stock")]

class StockMovement(models.Model):
    TYPES = [("sale", "Sale"), ("purchase", "Purchase"), ("adjustment", "Manual adjustment"), ("damage", "Damaged goods"), ("return", "Returned goods"), ("transfer", "Warehouse transfer")]
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="movements")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT)
    movement_type = models.CharField(max_length=20, choices=TYPES)
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    previous_stock = models.DecimalField(max_digits=12, decimal_places=3)
    new_stock = models.DecimalField(max_digits=12, decimal_places=3)
    reference = models.CharField(max_length=120, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

class Customer(models.Model):
    name = models.CharField(max_length=160)
    phone = models.CharField(max_length=40, blank=True)
    whatsapp = models.CharField(max_length=40, blank=True)
    address = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=80, blank=True)
    notes = models.TextField(blank=True)
    def __str__(self): return self.name

class Sale(models.Model):
    STATUS = [("draft", "Draft"), ("completed", "Completed"), ("cancelled", "Cancelled")]
    customer = models.ForeignKey(Customer, null=True, blank=True, on_delete=models.PROTECT, related_name="sales")
    status = models.CharField(max_length=20, choices=STATUS, default="draft")
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(Decimal("0"))])
    delivery_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(Decimal("0"))])
    paid = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(Decimal("0"))])
    completed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="completed_sales")
    created_at = models.DateTimeField(auto_now_add=True)
    @property
    def subtotal(self):
        return sum((item.subtotal for item in self.items.all()), Decimal("0"))

    @property
    def total(self):
        return self.subtotal - self.discount + self.delivery_fee

    @property
    def remaining(self):
        return max(self.total - self.paid, Decimal("0"))

class SaleItem(models.Model):
    UNITS = [("carton", "Carton"), ("m2", "m²")]
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT)
    unit = models.CharField(max_length=10, choices=UNITS, default="carton")
    quantity = models.DecimalField(max_digits=12, decimal_places=3, validators=[MinValueValidator(Decimal("0.001"))])
    quantity_cartons = models.DecimalField(max_digits=12, decimal_places=3, validators=[MinValueValidator(Decimal("0.001"))])
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0"))])
    purchase_unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(Decimal("0"))])

    @property
    def subtotal(self):
        return self.quantity * self.unit_price

    @property
    def gross_profit(self):
        return self.subtotal - (self.quantity_cartons * self.purchase_unit_cost)

class Purchase(models.Model):
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchases")
    invoice_reference = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=[("draft", "Draft"), ("received", "Received")], default="draft")
    created_at = models.DateTimeField(auto_now_add=True)
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="received_purchases")

class PurchaseItem(models.Model):
    purchase = models.ForeignKey(Purchase, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT)
    cartons = models.DecimalField(max_digits=12, decimal_places=3, validators=[MinValueValidator(Decimal("0.001"))])
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0"))])

class Payment(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="payments")
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="payments", null=True, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    created_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ("-created_at",)

class ProjectCalculation(models.Model):
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    wall_area = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    floor_area = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    waste_percent = models.DecimalField(max_digits=5, decimal_places=2, default=10)
    required_area = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    area_with_waste = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cartons_required = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
