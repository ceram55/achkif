import csv
from decimal import Decimal, ROUND_CEILING
from functools import wraps

from django.contrib.auth import authenticate, login, logout
from django.core.exceptions import ObjectDoesNotExist
from django.middleware.csrf import CsrfViewMiddleware
from django.db import transaction
from django.db.models import F, Sum
from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

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
    Warehouse,
)
from .serializers import (
    CategorySerializer,
    CustomerSerializer,
    InventorySettingsSerializer,
    ProductSerializer,
    PurchaseSerializer,
    SaleSerializer,
    SectionSerializer,
    StockMovementSerializer,
    SupplierSerializer,
    WarehouseSerializer,
)
from .services import cartons_for_sale, change_stock, complete_sale, receive_purchase


ROLE_ACCESS = {
    "owner": {"*"},
    "manager": {"catalog", "catalog_read", "sales", "purchases", "customers", "suppliers", "reports", "settings", "stock"},
    "employee": {"catalog_read", "sales", "customers"},
    "warehouse": {"catalog_read", "purchases", "stock"},
}


def user_role(user):
    if user.is_superuser:
        return "owner"
    try:
        return user.profile.role
    except ObjectDoesNotExist:
        return "employee"


def roles_required(*permissions):
    def decorate(view):
        @wraps(view)
        def wrapped(request, *args, **kwargs):
            role = user_role(request.user)
            granted = ROLE_ACCESS.get(role, set())
            if "*" not in granted and not set(permissions).issubset(granted):
                return Response({"detail": "You do not have permission to perform this action."}, status=status.HTTP_403_FORBIDDEN)
            return view(request, *args, **kwargs)

        return wrapped

    return decorate


def collection(model, serializer_class, read_permission, write_permission=None, searchable_fields=()):
    @api_view(["GET", "POST"])
    @permission_classes([IsAuthenticated])
    @roles_required(read_permission)
    def endpoint(request):
        if request.method == "GET":
            items = model.objects.all()
            search = request.query_params.get("search", "").strip()
            if search and searchable_fields:
                from django.db.models import Q

                query = Q()
                for field in searchable_fields:
                    query |= Q(**{f"{field}__icontains": search})
                items = items.filter(query)
            return Response(serializer_class(items, many=True, context={"request": request}).data)
        if not write_permission or not roles_required_check(request.user, write_permission):
            return Response({"detail": "You do not have permission to create this resource."}, status=status.HTTP_403_FORBIDDEN)
        input_data = request.data
        if model is Product:
            input_data = request.data.copy()
            input_data.pop("initial_cartons", None)
            input_data.pop("warehouse", None)
        serializer = serializer_class(data=input_data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        if model is Product:
            with transaction.atomic():
                payload = request.data
                try:
                    initial_stock = Decimal(str(payload.get("initial_cartons", "0")))
                except (ValueError, TypeError, ArithmeticError):
                    raise ValidationError({"initial_cartons": "Enter a valid carton quantity."})
                location_id = payload.get("warehouse")
                if not initial_stock.is_finite() or initial_stock < 0:
                    raise ValidationError({"initial_cartons": "Opening stock cannot be negative."})
                if initial_stock and not location_id:
                    raise ValidationError({"warehouse": "Choose a location for opening stock."})
                product = serializer.save()
                if initial_stock:
                    try:
                        warehouse = Warehouse.objects.get(pk=location_id)
                    except Warehouse.DoesNotExist:
                        raise ValidationError({"warehouse": "Choose a valid stock location."})
                    change_stock(product=product, warehouse=warehouse, quantity=initial_stock, movement_type="adjustment", user=request.user, reference="Opening stock")
        else:
            serializer.save()
        return Response(serializer_class(serializer.instance, context={"request": request}).data, status=status.HTTP_201_CREATED)

    return endpoint


def roles_required_check(user, permission):
    granted = ROLE_ACCESS.get(user_role(user), set())
    return "*" in granted or permission in granted


@ensure_csrf_cookie
@api_view(["GET"])
@permission_classes([AllowAny])
def csrf_token(request):
    return Response({"detail": "CSRF cookie set"})


@api_view(["POST"])
@permission_classes([AllowAny])
def sign_in(request):
    csrf_response = CsrfViewMiddleware(lambda csrf_request: None).process_view(request._request, None, (), {})
    if csrf_response is not None:
        return Response({"detail": "CSRF verification failed. Refresh the sign-in page and try again."}, status=status.HTTP_403_FORBIDDEN)
    username = str(request.data.get("username", "")).strip()
    password = request.data.get("password", "")
    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response({"detail": "Username or password is incorrect."}, status=status.HTTP_400_BAD_REQUEST)
    login(request, user)
    return Response({"id": user.pk, "username": user.get_username(), "role": user_role(user)})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def sign_out(request):
    logout(request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def current_user(request):
    return Response({"id": request.user.pk, "username": request.user.get_username(), "role": user_role(request.user)})


products = collection(Product, ProductSerializer, "catalog_read", "catalog", ("reference", "name", "category__name", "section__name", "color", "dimensions", "supplier__name"))
categories = collection(Category, CategorySerializer, "catalog_read", "catalog", ("name",))
sections = collection(Section, SectionSerializer, "catalog_read", "catalog", ("name",))
warehouses = collection(Warehouse, WarehouseSerializer, "catalog_read", "catalog", ("name",))
suppliers = collection(Supplier, SupplierSerializer, "suppliers", "suppliers", ("name", "phone", "contact"))
customers = collection(Customer, CustomerSerializer, "customers", "customers", ("name", "phone", "city"))


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
@roles_required("catalog_read")
def product_detail(request, product_id):
    try:
        product = Product.objects.select_related("category", "section", "supplier").get(pk=product_id)
    except Product.DoesNotExist:
        return Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
    if request.method == "GET":
        return Response(ProductSerializer(product, context={"request": request}).data)
    if not roles_required_check(request.user, "catalog"):
        return Response({"detail": "You do not have permission to change products."}, status=status.HTTP_403_FORBIDDEN)
    if request.method == "DELETE":
        product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    serializer = ProductSerializer(product, data=request.data, partial=True, context={"request": request})
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@roles_required("stock")
def movements(request):
    queryset = StockMovement.objects.select_related("product", "warehouse", "user").order_by("-created_at")
    product = request.query_params.get("product")
    if product:
        queryset = queryset.filter(product_id=product)
    return Response(StockMovementSerializer(queryset[:500], many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@roles_required("stock")
def stock_adjustment(request):
    try:
        product = Product.objects.get(pk=request.data.get("product"))
        warehouse = Warehouse.objects.get(pk=request.data.get("warehouse"))
        quantity = Decimal(str(request.data.get("quantity", "0")))
        movement_type = request.data.get("movement_type", "adjustment")
        if movement_type not in {"adjustment", "damage", "return"}:
            raise ValidationError("Movement type must be adjustment, damage, or return.")
        movement = change_stock(product=product, warehouse=warehouse, quantity=quantity, movement_type=movement_type, user=request.user, reference=str(request.data.get("reference", "")))
    except (Product.DoesNotExist, Warehouse.DoesNotExist):
        raise ValidationError("Select a valid product and warehouse.")
    except (ValueError, TypeError, ArithmeticError):
        raise ValidationError("Quantity must be a valid number.")
    return Response(StockMovementSerializer(movement).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@roles_required("stock")
def stock_transfer(request):
    try:
        product = Product.objects.get(pk=request.data.get("product"))
        source = Warehouse.objects.get(pk=request.data.get("from_warehouse"))
        target = Warehouse.objects.get(pk=request.data.get("to_warehouse"))
        quantity = Decimal(str(request.data.get("quantity", "0")))
        if source.pk == target.pk:
            raise ValidationError("Choose two different warehouses.")
        if not quantity.is_finite() or quantity <= 0:
            raise ValidationError("Transfer quantity must be greater than zero.")
        with transaction.atomic():
            change_stock(product=product, warehouse=source, quantity=-quantity, movement_type="transfer", user=request.user, reference="Warehouse transfer")
            change_stock(product=product, warehouse=target, quantity=quantity, movement_type="transfer", user=request.user, reference="Warehouse transfer")
    except (Product.DoesNotExist, Warehouse.DoesNotExist):
        raise ValidationError("Select a valid product and warehouse.")
    except (ValueError, TypeError, ArithmeticError):
        raise ValidationError("Quantity must be a valid number.")
    return Response({"detail": "Stock transferred."}, status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@roles_required("sales")
def sales(request):
    if request.method == "GET":
        queryset = Sale.objects.select_related("customer").prefetch_related("items__product").order_by("-created_at")[:200]
        return Response(SaleSerializer(queryset, many=True).data)
    items_data = request.data.get("items")
    if not isinstance(items_data, list) or not items_data:
        raise ValidationError({"items": "Add at least one product to the sale."})
    try:
        with transaction.atomic():
            customer = Customer.objects.filter(pk=request.data.get("customer")).first() if request.data.get("customer") else None
            sale = Sale.objects.create(
                customer=customer,
                discount=Decimal(str(request.data.get("discount", "0"))),
                delivery_fee=Decimal(str(request.data.get("delivery_fee", "0"))),
                paid=Decimal(str(request.data.get("paid", "0"))),
            )
            if not all(value.is_finite() for value in (sale.discount, sale.delivery_fee, sale.paid)):
                raise ValidationError("Discount, delivery fee, and payment must be finite amounts.")
            if sale.discount < 0 or sale.delivery_fee < 0 or sale.paid < 0:
                raise ValidationError("Discount, delivery fee, and payment cannot be negative.")
            for row in items_data:
                product = Product.objects.get(pk=row.get("product"))
                warehouse = Warehouse.objects.get(pk=row.get("warehouse"))
                unit = row.get("unit", "carton")
                quantity, cartons = cartons_for_sale(product, row.get("quantity", "0"), unit)
                unit_price = product.selling_price_m2 if unit == "m2" else product.selling_price_carton
                SaleItem.objects.create(
                    sale=sale,
                    product=product,
                    warehouse=warehouse,
                    unit=unit,
                    quantity=quantity,
                    quantity_cartons=cartons,
                    unit_price=unit_price,
                    purchase_unit_cost=product.purchase_price,
                )
            if sale.discount > sale.subtotal:
                raise ValidationError({"discount": "Discount cannot exceed the subtotal."})
            if sale.paid > sale.total:
                raise ValidationError({"paid": "Payment cannot exceed the sale total."})
            complete_sale(sale, request.user)
    except (Product.DoesNotExist, Warehouse.DoesNotExist):
        raise ValidationError("A selected product or warehouse does not exist.")
    except (ValueError, TypeError, ArithmeticError):
        raise ValidationError("Enter valid numeric amounts and quantities.")
    return Response(SaleSerializer(sale).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@roles_required("purchases")
def purchases(request):
    if request.method == "GET":
        queryset = Purchase.objects.select_related("supplier").prefetch_related("items__product").order_by("-created_at")[:200]
        return Response(PurchaseSerializer(queryset, many=True, context={"request": request}).data)
    items_data = request.data.get("items")
    if not isinstance(items_data, list) or not items_data:
        raise ValidationError({"items": "Add at least one product to the purchase."})
    try:
        with transaction.atomic():
            supplier = Supplier.objects.get(pk=request.data.get("supplier"))
            purchase = Purchase.objects.create(supplier=supplier, invoice_reference=str(request.data.get("invoice_reference", "")), notes=str(request.data.get("notes", "")))
            for row in items_data:
                product = Product.objects.get(pk=row.get("product"))
                warehouse = Warehouse.objects.get(pk=row.get("warehouse"))
                cartons = Decimal(str(row.get("cartons", "0")))
                purchase_price = Decimal(str(row.get("purchase_price", product.purchase_price)))
                if not cartons.is_finite() or cartons <= 0 or not purchase_price.is_finite() or purchase_price < 0:
                    raise ValidationError("Purchase quantities must be positive and prices must be non-negative finite amounts.")
                PurchaseItem.objects.create(
                    purchase=purchase,
                    product=product,
                    warehouse=warehouse,
                    cartons=cartons,
                    purchase_price=purchase_price,
                )
            receive_purchase(purchase, request.user)
    except (Supplier.DoesNotExist, Product.DoesNotExist, Warehouse.DoesNotExist):
        raise ValidationError("A selected supplier, product, or warehouse does not exist.")
    except (ValueError, TypeError, ArithmeticError):
        raise ValidationError("Enter valid quantities and purchase prices.")
    return Response(PurchaseSerializer(purchase, context={"request": request}).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@roles_required("sales")
def receive_customer_payment(request):
    try:
        amount = Decimal(str(request.data.get("amount", "0")))
        customer = Customer.objects.get(pk=request.data.get("customer"))
    except Customer.DoesNotExist:
        raise ValidationError({"customer": "Select a valid customer."})
    except (ValueError, TypeError, ArithmeticError):
        raise ValidationError({"amount": "Enter a valid payment amount."})
    if not amount.is_finite() or amount <= 0:
        raise ValidationError({"amount": "Payment must be greater than zero."})

    with transaction.atomic():
        open_sales = list(Sale.objects.select_for_update().filter(customer=customer, status="completed").order_by("created_at", "id"))
        outstanding = sum((sale.remaining for sale in open_sales), Decimal("0"))
        if amount > outstanding:
            raise ValidationError({"amount": f"Payment exceeds the outstanding balance of {outstanding}."})
        remaining_payment = amount
        for sale in open_sales:
            allocated = min(sale.remaining, remaining_payment)
            if allocated <= 0:
                continue
            sale.paid += allocated
            sale.save(update_fields=["paid"])
            Payment.objects.create(customer=customer, sale=sale, amount=allocated, notes=str(request.data.get("notes", "")))
            remaining_payment -= allocated
            if remaining_payment == 0:
                break
    return Response(CustomerSerializer(customer).data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@roles_required("catalog_read")
def calculator(request):
    try:
        product = Product.objects.get(pk=request.data.get("product"))
        wall = Decimal(str(request.data.get("wall_area", "0")))
        floor = Decimal(str(request.data.get("floor_area", "0")))
        waste = Decimal(str(request.data.get("waste_percent", "10")))
        if wall < 0 or floor < 0 or waste < 0 or wall + floor <= 0:
            raise ValidationError("Enter positive wall or floor area and a non-negative waste percentage.")
        required_area = wall + floor
        area_with_waste = required_area * (Decimal("1") + waste / Decimal("100"))
        cartons = (area_with_waste / product.m2_per_carton).quantize(Decimal("1"), rounding=ROUND_CEILING)
    except Product.DoesNotExist:
        raise ValidationError({"product": "Select a valid product."})
    except (ValueError, TypeError, ArithmeticError):
        raise ValidationError("Enter valid area and waste values.")
    available = product.total_cartons
    actual_area = cartons * product.m2_per_carton
    ProjectCalculation.objects.create(
        product=product,
        user=request.user,
        wall_area=wall,
        floor_area=floor,
        waste_percent=waste,
        required_area=required_area,
        area_with_waste=area_with_waste,
        cartons_required=cartons,
    )
    result = {
        "required_area": required_area,
        "waste_percent": waste,
        "area_with_waste": area_with_waste,
        "cartons_required": cartons,
        "actual_area": actual_area,
        "remaining_area": actual_area - area_with_waste,
        "available_cartons": available,
        "sufficient": available >= cartons,
        "shortage": max(cartons - available, Decimal("0")),
        "remaining_cartons": max(available - cartons, Decimal("0")),
    }
    return Response(result)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@roles_required("catalog_read")
def dashboard(request):
    products_qs = Product.objects.select_related("category")
    stock_rows = Stock.objects.select_related("product", "product__category")
    today = timezone.localdate()
    month_start = today.replace(day=1)
    completed_sales = Sale.objects.filter(status="completed")
    low_stock = []
    for product in products_qs:
        cartons = product.total_cartons
        if cartons <= product.minimum_stock:
            low_stock.append({"id": product.pk, "reference": product.reference, "name": product.name, "cartons": cartons, "minimum_stock": product.minimum_stock})
    response_data = {
        "total_products": products_qs.count(),
        "total_cartons": stock_rows.aggregate(total=Sum("cartons"))["total"] or Decimal("0"),
        "total_m2": sum((row.cartons * row.product.m2_per_carton for row in stock_rows), Decimal("0")),
        "today_sales": sum((sale.total for sale in completed_sales.filter(created_at__date=today)), Decimal("0")),
        "monthly_sales": sum((sale.total for sale in completed_sales.filter(created_at__date__gte=month_start)), Decimal("0")),
        "order_count": completed_sales.count(),
        "today_order_count": completed_sales.filter(created_at__date=today).count(),
        "low_stock": low_stock,
        "out_of_stock": [item for item in low_stock if item["cartons"] == 0],
        "category_breakdown": list(stock_rows.values(label=F("product__category__name")).annotate(value=Sum("cartons")).order_by("label")),
        "sales_over_time": list(completed_sales.values(day=F("created_at__date")).annotate(total=Sum("paid")).order_by("day")[:30]),
    }
    if user_role(request.user) in {"owner", "manager"}:
        response_data["inventory_purchase_value"] = sum((row.cartons * row.product.purchase_price for row in stock_rows), Decimal("0"))
        response_data["estimated_profit"] = sum((item.gross_profit for item in SaleItem.objects.filter(sale__status="completed")), Decimal("0"))
        response_data["most_sold_products"] = list(SaleItem.objects.filter(sale__status="completed").values(name=F("product__name")).annotate(quantity=Sum("quantity_cartons")).order_by("-quantity")[:5])
    return Response(response_data)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def inventory_settings(request):
    if request.method == "GET" and not roles_required_check(request.user, "catalog_read"):
        return Response({"detail": "You do not have permission to read inventory settings."}, status=status.HTTP_403_FORBIDDEN)
    if request.method == "PATCH" and not roles_required_check(request.user, "settings"):
        return Response({"detail": "You do not have permission to change inventory settings."}, status=status.HTTP_403_FORBIDDEN)
    settings_row = InventorySettings.objects.first()
    if settings_row is None:
        settings_row = InventorySettings.objects.create()
    if request.method == "GET":
        return Response(InventorySettingsSerializer(settings_row).data)
    serializer = InventorySettingsSerializer(settings_row, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@roles_required("reports")
def inventory_csv(request):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="achkif-inventory.csv"'
    writer = csv.writer(response)
    writer.writerow(("Reference", "Product", "Category", "Section", "Cartons", "Square meters", "Minimum stock"))
    for product in Product.objects.select_related("category", "section"):
        writer.writerow((product.reference, product.name, product.category.name, product.section.name, product.total_cartons, product.total_m2, product.minimum_stock))
    return response