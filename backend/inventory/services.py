from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP

from django.db import transaction
from rest_framework.exceptions import ValidationError

from .models import InventorySettings, Payment, Purchase, Sale, Stock, StockMovement


@transaction.atomic
def change_stock(*, product, warehouse, quantity, movement_type, user, reference=""):
    quantity = Decimal(quantity)
    if not quantity.is_finite() or quantity == 0:
        raise ValidationError("Stock changes must have a non-zero quantity.")

    stock, _ = Stock.objects.get_or_create(product=product, warehouse=warehouse)
    stock = Stock.objects.select_for_update().get(pk=stock.pk)
    previous = stock.cartons
    updated = previous + quantity
    settings_row = InventorySettings.objects.first()
    stock_control_enabled = settings_row.stock_control_enabled if settings_row else True
    if updated < 0 and stock_control_enabled:
        raise ValidationError(
            f"Not enough stock for {product.reference} at {warehouse.name}. Available: {previous} cartons."
        )

    stock.cartons = updated
    stock.save(update_fields=["cartons"])
    movement = StockMovement.objects.create(
        product=product,
        warehouse=warehouse,
        movement_type=movement_type,
        quantity=abs(quantity),
        previous_stock=previous,
        new_stock=updated,
        reference=reference,
        user=user,
    )
    return movement


@transaction.atomic
def receive_purchase(purchase, user):
    if purchase.status == "received":
        raise ValidationError("This purchase has already been received.")
    for item in purchase.items.select_related("product", "warehouse"):
        if item.cartons <= 0 or item.purchase_price < 0:
            raise ValidationError("Purchase quantities must be positive and prices cannot be negative.")
        change_stock(
            product=item.product,
            warehouse=item.warehouse,
            quantity=item.cartons,
            movement_type="purchase",
            user=user,
            reference=purchase.invoice_reference or f"Purchase {purchase.pk}",
        )
        item.product.purchase_price = item.purchase_price
        item.product.save(update_fields=["purchase_price"])
    purchase.status = "received"
    purchase.received_by = user
    purchase.save(update_fields=["status", "received_by"])
    return purchase


@transaction.atomic
def complete_sale(sale, user):
    if sale.status != "draft":
        raise ValidationError("Only draft sales can be completed.")
    sale.completed_by = user
    sale.save(update_fields=["completed_by"])
    for item in sale.items.select_related("product", "warehouse"):
        change_stock(
            product=item.product,
            warehouse=item.warehouse,
            quantity=-item.quantity_cartons,
            movement_type="sale",
            user=user,
            reference=f"Sale {sale.pk}",
        )
    sale.status = "completed"
    sale.save(update_fields=["status"])
    if sale.customer_id and sale.paid > 0:
        Payment.objects.create(customer=sale.customer, sale=sale, amount=sale.paid)
    return sale


def cartons_for_sale(product, quantity, unit):
    quantity = Decimal(quantity)
    if not quantity.is_finite() or quantity <= 0:
        raise ValidationError("Quantity must be greater than zero.")
    if unit == "carton":
        return quantity, quantity
    if unit != "m2":
        raise ValidationError("Unit must be carton or m2.")

    cartons = quantity / product.m2_per_carton
    settings_row = InventorySettings.objects.first()
    if settings_row is None or settings_row.whole_carton_required:
        cartons = cartons.quantize(Decimal("1"), rounding=ROUND_CEILING)
        quantity = cartons * product.m2_per_carton
    else:
        cartons = cartons.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
    return quantity, cartons